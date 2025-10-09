import asyncio
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
    WorkerOptions,
    cli,
    llm,
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

    # To add more tools, use the @function_tool decorator.
    # Here's an example that adds a simple weather tool.
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


class MultimodalHandler:
    """Handles both text and voice interactions with real-time streaming"""
    
    def __init__(self, session: AgentSession, room: rtc.Room):
        self.session = session
        self.room = room
        self.chat_ctx = llm.ChatContext()
        self.current_message_id = 0
        
    async def handle_text_message(self, message_text: str, participant):
        """Handle incoming text messages and stream response back in real-time"""
        participant_id = getattr(participant, 'identity', 'unknown') if participant else 'unknown'
        logger.info(f"Received text message from {participant_id}: {message_text}")
        
        try:
            # Create a unique message ID for this conversation
            self.current_message_id += 1
            message_id = f"msg_{self.current_message_id}"
            
            # Add user message to chat context
            self.chat_ctx.messages.append(
                llm.ChatMessage.create(text=message_text, role="user")
            )
            
            # Get the LLM from the session
            session_llm = self.session._llm
            if not session_llm:
                logger.error("No LLM available in session")
                # Send a simple fallback response
                fallback_response = "I'm sorry, but I'm having trouble connecting to my language model. Please try again later."
                await self.room.local_participant.publish_data(
                    fallback_response.encode('utf-8'),
                    reliable=True,
                    topic="assistant_text_stream"
                )
                return
                
            # Send initial response indicator
            await self.room.local_participant.publish_data(
                f"__START_RESPONSE__{message_id}".encode('utf-8'),
                reliable=True,
                topic="assistant_text_stream"
            )
            
            # Generate streaming response
            response_text = ""
            try:
                stream = session_llm.chat(chat_ctx=self.chat_ctx)
                
                async for chunk in stream:
                    # Handle different response formats (OpenAI vs Google)
                    content = ""
                    if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                        # OpenAI format
                        delta = chunk.choices[0].delta
                        if hasattr(delta, 'content') and delta.content:
                            content = delta.content
                    elif hasattr(chunk, 'content'):
                        # Google format
                        content = chunk.content
                    elif hasattr(chunk, 'text'):
                        # Alternative format
                        content = chunk.text
                    
                    if content:
                        response_text += content
                        
                        # Stream the token back to the client
                        stream_data = f"{message_id}::{content}".encode('utf-8')
                        await self.room.local_participant.publish_data(
                            stream_data,
                            reliable=True,
                            topic="assistant_text_stream"
                        )
                        
            except Exception as stream_error:
                logger.error(f"Error during streaming: {stream_error}")
                # Fallback to a simple non-streaming response
                response_text = "Hello! I received your message. How can I help you today?"
                
                stream_data = f"{message_id}::{response_text}".encode('utf-8')
                await self.room.local_participant.publish_data(
                    stream_data,
                    reliable=True,
                    topic="assistant_text_stream"
                )
            
            # Send end of response indicator
            await self.room.local_participant.publish_data(
                f"__END_RESPONSE__{message_id}".encode('utf-8'),
                reliable=True,
                topic="assistant_text_stream"
            )
            
            # Add assistant response to context
            if response_text:
                self.chat_ctx.messages.append(
                    llm.ChatMessage.create(text=response_text, role="assistant")
                )
                
                logger.info(f"Completed text response: {response_text[:100]}...")
            
        except Exception as e:
            logger.error(f"Error handling text message: {e}")
            # Send error message to client
            error_message = "Sorry, I encountered an error processing your message."
            await self.room.local_participant.publish_data(
                error_message.encode('utf-8'),
                reliable=True,
                topic="assistant_text_stream"
            )


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Set up a voice AI pipeline using Google Gemini, AssemblyAI, Cartesia, and the LiveKit turn detector
    session = AgentSession(
        # Speech-to-text (STT) is your agent's ears, turning the user's speech into text that the LLM can understand
        # See all available models at https://docs.livekit.io/agents/models/stt/
        stt="assemblyai/universal-streaming:en",
        # A Large Language Model (LLM) is your agent's brain, processing user input and generating a response
        # Using Google Gemini instead of OpenAI
        # See all available models at https://docs.livekit.io/agents/models/llm/
        llm="google/gemini-2.5-flash",
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
    )

    # Create multimodal handler for text messaging
    multimodal_handler = MultimodalHandler(session, ctx.room)

    # Set up event handlers for text messaging
    @ctx.room.on("data_received")
    def on_data_received(data_packet, participant=None):
        """Handle incoming data packets (text messages)"""
        try:
            # Check if the data packet has the right topic
            if hasattr(data_packet, 'topic') and data_packet.topic == "user_text_message":
                message_text = data_packet.data.decode('utf-8')
                logger.info(f"Received text message: {message_text}")
                # Handle text message asynchronously
                asyncio.create_task(
                    multimodal_handler.handle_text_message(message_text, participant)
                )
            elif hasattr(data_packet, 'data'):
                # Try to decode as plain text if no topic or different topic
                try:
                    message_text = data_packet.data.decode('utf-8')
                    logger.info(f"Received data without topic: {message_text}")
                    # Handle as text message anyway
                    asyncio.create_task(
                        multimodal_handler.handle_text_message(message_text, participant)
                    )
                except UnicodeDecodeError:
                    logger.debug("Received non-text data packet, ignoring")
        except Exception as e:
            logger.error(f"Error processing data packet: {e}")

    @ctx.room.on("chat_message_received")
    def on_chat_message(chat_message, participant=None):
        """Handle incoming chat messages"""
        try:
            # Make sure it's not from the agent itself
            if participant and participant != ctx.room.local_participant:
                message_text = chat_message.message if hasattr(chat_message, 'message') else str(chat_message)
                logger.info(f"Received chat message: {message_text}")
                # Handle chat message as text input
                asyncio.create_task(
                    multimodal_handler.handle_text_message(message_text, participant)
                )
        except Exception as e:
            logger.error(f"Error processing chat message: {e}")

    # Log when participants join/leave
    @ctx.room.on("participant_connected")
    def on_participant_connected(participant):
        logger.info(f"Participant connected: {participant.identity}")

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        logger.info(f"Participant disconnected: {participant.identity}")

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

    # Start the session, which initializes the voice pipeline and warms up the models
    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            # For telephony applications, use `BVCTelephony` for best results
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    # Join the room and connect to the user
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
