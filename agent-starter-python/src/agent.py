import logging

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    RoomInputOptions,
    RoomOutputOptions,
    WorkerOptions,
    cli,
    metrics,
)
from livekit.agents.llm import function_tool
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("agent")

load_dotenv(".env.local")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a helpful AI assistant that supports both voice and text interactions. 
            When users speak to you, respond naturally as if having a conversation.
            When users send text messages, provide clear and helpful responses.
            You can seamlessly handle both voice and text in the same session.
            Your responses are concise, friendly, and informative.
            You are curious, helpful, and have a sense of humor.""",
        )

    @function_tool
    async def get_current_time(self):
        """Get the current time and date.
        
        Use this tool when users ask about the current time, date, or what day it is.
        """
        from datetime import datetime
        now = datetime.now()
        return f"The current time is {now.strftime('%I:%M %p')} on {now.strftime('%A, %B %d, %Y')}"

    # To add tools, use the @function_tool decorator.
    # Here's an example that adds a simple weather tool.
    # You also have to add `from livekit.agents.llm import function_tool, RunContext` to the top of this file
    # @function_tool
    # async def lookup_weather(self, context: RunContext, location: str):
    #     """Use this tool to look up current weather information in the given location.
    #
    #     If the location is not supported by the weather service, the tool will indicate this. You must tell the user the location's weather is unavailable.
    #
    #     Args:
    #         location: The location to look up weather information for (e.g. city name)
    #     """
    #
    #     logger.info(f"Looking up weather for {location}")
    #
    #     return "sunny with a temperature of 70 degrees."


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Set up a voice AI pipeline with text support using OpenAI, Cartesia, AssemblyAI, and the LiveKit turn detector
    session = AgentSession(
        # Speech-to-text (STT) is your agent's ears, turning the user's speech into text that the LLM can understand
        # See all available models at https://docs.livekit.io/agents/models/stt/
        stt="assemblyai/universal-streaming:en",
        # A Large Language Model (LLM) is your agent's brain, processing user input and generating a response
        # See all available models at https://docs.livekit.io/agents/models/llm/
        llm="openai/gpt-4o-mini",
        # Text-to-speech (TTS) is your agent's voice, turning the LLM's text into speech that the user can hear
        # See all available models as well as voice selections at https://docs.livekit.io/agents/models/tts/
        tts="cartesia/sonic-2:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        # VAD and turn detection are used to determine when the user is speaking and when the agent should respond
        # See more at https://docs.livekit.io/agents/build/turns
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        # allow the LLM to generate a response while waiting for the end of turn
        # See more at https://docs.livekit.io/agents/build/audio/#preemptive-generation
        preemptive_generation=True,
        # Enable TTS-aligned transcription for better synchronization
        use_tts_aligned_transcript=True,
    )

    # To use a realtime model instead of a voice pipeline, use the following session setup instead.
    # (Note: This is for the OpenAI Realtime API. For other providers, see https://docs.livekit.io/agents/models/realtime/))
    # 1. Install livekit-agents[openai]
    # 2. Set OPENAI_API_KEY in .env.local
    # 3. Add `from livekit.plugins import openai` to the top of this file
    # 4. Use the following session setup instead of the version above
    # session = AgentSession(
    #     llm=openai.realtime.RealtimeModel(voice="marin")
    # )

    # Metrics collection, to measure pipeline performance
    # For more information, see https://docs.livekit.io/agents/build/metrics/
    usage_collector = metrics.UsageCollector()

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent):
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)

    # Track conversation items for both text and voice interactions
    @session.on("conversation_item_added")
    def _on_conversation_item_added(item):
        """Handle when text input or output is committed to chat history"""
        logger.info(f"Conversation item added: {item.type} - {getattr(item, 'text', '')[:100]}...")

    # Log when participants join/leave for debugging
    @ctx.room.on("participant_connected")
    def _on_participant_connected(participant):
        logger.info(f"Participant connected: {participant.identity}")

    @ctx.room.on("participant_disconnected")  
    def _on_participant_disconnected(participant):
        logger.info(f"Participant disconnected: {participant.identity}")

    async def log_usage():
        summary = usage_collector.get_summary()
        logger.info(f"Usage: {summary}")

    ctx.add_shutdown_callback(log_usage)

    # # Add a virtual avatar to the session, if desired
    # # For other providers, see https://docs.livekit.io/agents/models/avatar/
    # avatar = hedra.AvatarSession(
    #   avatar_id="...",  # See https://docs.livekit.io/agents/models/avatar/plugins/hedra
    # )
    # # Start the avatar and wait for it to join
    # await avatar.start(session, room=ctx.room)

    # Start the session with both text and voice enabled
    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            # Enable both audio and text input
            audio_enabled=True,
            text_enabled=True,
            # For telephony applications, use `BVCTelephony` for best results
            noise_cancellation=noise_cancellation.BVC(),
        ),
        room_output_options=RoomOutputOptions(
            # Enable both audio and text output
            audio_enabled=True,
            transcription_enabled=True,
            # Sync transcriptions with speech for better UX
            sync_transcription=True,
        ),
    )

    # Join the room and connect to the user
    await ctx.connect()

    # Register RPC method after connection is established
    @ctx.room.local_participant.register_rpc_method("toggle_communication_mode")
    async def toggle_communication_mode(data: rtc.RpcInvocationData) -> str:
        """Toggle between voice and text communication modes"""
        try:
            # Parse the request - expect "voice" or "text"
            mode = data.payload.decode('utf-8') if data.payload else "voice"
            logger.info(f"Toggling communication mode to: {mode}")
            
            if mode == "voice":
                # Enable voice pipeline (STT + TTS)
                session.output.set_audio_enabled(True)
                logger.info("Voice mode enabled - agent will respond with speech")
                return "voice_mode_enabled"
            elif mode == "text":
                # Disable voice output, keep text input
                session.output.set_audio_enabled(False) 
                logger.info("Text mode enabled - agent will respond with text only")
                return "text_mode_enabled"
            else:
                logger.warning(f"Unknown communication mode: {mode}")
                return "error_unknown_mode"
                
        except Exception as e:
            logger.error(f"Error toggling communication mode: {e}")
            return f"error_{str(e)}"
    
    logger.info("Agent is ready and RPC methods registered")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))