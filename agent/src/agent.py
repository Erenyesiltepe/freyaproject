import logging
import json

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
from livekit.agents.llm import function_tool, ChatContext
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("agent")

load_dotenv(".env.local")


class Assistant(Agent):
    def __init__(self, initial_instructions: str):
        initial_ctx = ChatContext()
        initial_ctx.add_message(role="system", content=initial_instructions)
        super().__init__(chat_ctx=initial_ctx, instructions=initial_instructions)
        print(f"Agent initialized with instructions: {initial_instructions}")

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
    # Connect to the room first
    await ctx.connect()

    # Wait for the first (and only) human participant to join
    human_participant = await ctx.wait_for_participant()
    
    # --- KEY STEP: Retrieve the instruction from the participant's metadata ---
    # This is the data you set in the access token's 'metadata' field
    participant_instructions = human_participant.metadata
    
    if not participant_instructions:
        # Fallback if the metadata was empty
        print("Warning: Participant metadata empty. Using generic instructions.")
        participant_instructions = "You are a helpful assistant."
        instructions_data = {"agent_instructions": participant_instructions}
    else:
        try:
            instructions_data = json.loads(participant_instructions)
            participant_instructions = instructions_data.get("agent_instructions", "You are a helpful assistant.")
            print(f"Loaded participant instructions: {instructions_data.get('prompt_title', 'assistant')}")
        except json.JSONDecodeError:
            print(f"Failed to parse participant metadata as JSON, using as plain text: {participant_instructions}")
            instructions_data = {"agent_instructions": participant_instructions}

    # Create and start the session with the custom instructions
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

    agent_instance = Assistant(participant_instructions)

    await session.start(
        agent=agent_instance,
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
    
    # Register RPC methods for additional functionality
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

    @ctx.room.local_participant.register_rpc_method("get_agent_metrics")
    async def get_agent_metrics(data: rtc.RpcInvocationData) -> str:
        """Get current agent performance metrics"""
        try:
            import json
            
            # For now, return basic metrics
            metrics_data = {
                'status': 'active',
                'instructions_loaded': bool(participant_instructions),
                'timestamp': __import__('datetime').datetime.now().isoformat()
            }
            
            logger.info(f"Agent metrics requested: {metrics_data}")
            return json.dumps(metrics_data)
            
        except Exception as e:
            logger.error(f"Error getting agent metrics: {e}")
            return json.dumps({'error': str(e)})

    @ctx.room.local_participant.register_rpc_method("test_audio_output")
    async def test_audio_output(data: rtc.RpcInvocationData) -> str:
        """Test agent audio output"""
        try:
            logger.info("Audio test requested")
            # Send a test audio response
            await session.generate_reply("This is an audio test. If you can hear this, the agent audio is working correctly.")
            return "audio_test_sent"
        except Exception as e:
            logger.error(f"Error in audio test: {e}")
            return f"error_{str(e)}"
    
    logger.info("Agent is ready and RPC methods registered")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))