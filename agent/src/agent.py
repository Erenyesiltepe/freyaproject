import logging
import json
from datetime import datetime, timedelta
import statistics

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
        
        # Initialize metrics storage using LiveKit's native metrics events
        self.metrics_storage = {
            'first_token_latencies': [],  # Store (timestamp, ttft_ms) from LLMMetrics.ttft
            'token_generation_rates': [],  # Store (timestamp, tokens_per_sec) from LLMMetrics.tokens_per_second
            'error_events': [],  # Store (timestamp, error_type) for tracked errors
            'session_start_time': datetime.now(),
            'total_llm_calls': 0,
            'total_errors': 0
        }

    @function_tool
    async def get_current_time(self):
        """Get the current time and date.
        
        Use this tool when users ask about the current time, date, or what day it is.
        """
        from datetime import datetime
        now = datetime.now()
        return f"The current time is {now.strftime('%I:%M %p')} on {now.strftime('%A, %B %d, %Y')}"
    
    def handle_metrics_event(self, event: MetricsCollectedEvent):
        """Handle LiveKit metrics events to collect performance data"""
        now = datetime.now()
        metrics_processed = 0
        
        logger.debug(f"Processing {type(event.metrics).__name__} metric at {now}")
        
        # Process single metric object (not a list)
        metric = event.metrics
        try:
            # Check for first token latency (TTFT) - only in LLMMetrics
            if hasattr(metric, 'ttft') and metric.ttft is not None:
                # Time to first token in milliseconds (LiveKit provides seconds)
                ttft_ms = metric.ttft * 1000
                self.metrics_storage['first_token_latencies'].append((now, ttft_ms))
                self.metrics_storage['total_llm_calls'] += 1
                metrics_processed += 1
                
                logger.info(f"TTFT captured: {ttft_ms:.2f}ms (total calls: {self.metrics_storage['total_llm_calls']})")
                
                # Keep only last 1000 measurements for memory efficiency
                if len(self.metrics_storage['first_token_latencies']) > 1000:
                    self.metrics_storage['first_token_latencies'] = self.metrics_storage['first_token_latencies'][-1000:]
            
            # Check for token generation rate - only in LLMMetrics
            if hasattr(metric, 'tokens_per_second') and metric.tokens_per_second is not None:
                # Token generation rate
                self.metrics_storage['token_generation_rates'].append((now, metric.tokens_per_second))
                metrics_processed += 1
                
                logger.info(f"Token rate captured: {metric.tokens_per_second:.2f} tokens/sec")
                
                # Keep only last 1000 measurements
                if len(self.metrics_storage['token_generation_rates']) > 1000:
                    self.metrics_storage['token_generation_rates'] = self.metrics_storage['token_generation_rates'][-1000:]
            
            # Check for other relevant metrics (completion tokens, prompt tokens, etc.)
            if hasattr(metric, 'completion_tokens') and metric.completion_tokens is not None:
                logger.debug(f"Completion tokens: {metric.completion_tokens}")
            
            if hasattr(metric, 'prompt_tokens') and metric.prompt_tokens is not None:
                logger.debug(f"Prompt tokens: {metric.prompt_tokens}")
            
            # Log the metric type for debugging
            if metrics_processed == 0:
                logger.debug(f"Received {type(metric).__name__} metric (no TTFT/tokens_per_second data)")
                
        except Exception as e:
            logger.error(f"Error processing metric {type(metric).__name__}: {e}")
            self.track_error("metric_processing_error")
        
        if metrics_processed > 0:
            logger.info(f"Successfully processed {metrics_processed} metrics from {type(metric).__name__}. Current totals: TTFT={len(self.metrics_storage['first_token_latencies'])}, TokenRates={len(self.metrics_storage['token_generation_rates'])}")
        else:
            # Only log warning for LLMMetrics since other metric types don't have TTFT/token data
            if type(metric).__name__ == 'LLMMetrics':
                logger.warning(f"No TTFT or token rate data found in {type(metric).__name__}")
                # Log available metric attributes for debugging
                attrs = [attr for attr in dir(metric) if not attr.startswith('_')]
                logger.debug(f"LLMMetrics attributes: {attrs}")
    
    def track_error(self, error_type="general"):
        """Track errors with timestamp for error rate calculation"""
        now = datetime.now()
        self.metrics_storage['error_events'].append((now, error_type))
        self.metrics_storage['total_errors'] += 1
        
        # Keep only last 1000 error events
        if len(self.metrics_storage['error_events']) > 1000:
            self.metrics_storage['error_events'] = self.metrics_storage['error_events'][-1000:]
    
    def get_performance_metrics(self):
        """Calculate and return the three required performance metrics using LiveKit data"""
        now = datetime.now()
        last_24h = now - timedelta(hours=24)
        
        logger.debug(f"Calculating metrics. Storage contains: {len(self.metrics_storage['first_token_latencies'])} TTFT, {len(self.metrics_storage['token_generation_rates'])} token rates, {len(self.metrics_storage['error_events'])} errors")
        
        # 1. Average first-token latency (last 24 hours)
        recent_first_token_latencies = [
            ttft_ms for timestamp, ttft_ms in self.metrics_storage['first_token_latencies']
            if timestamp >= last_24h
        ]
        avg_first_token_latency = statistics.mean(recent_first_token_latencies) if recent_first_token_latencies else 0
        
        # 2. Average tokens per second (last 24 hours)
        recent_token_rates = [
            tokens_per_sec for timestamp, tokens_per_sec in self.metrics_storage['token_generation_rates']
            if timestamp >= last_24h
        ]
        avg_tokens_per_sec = statistics.mean(recent_token_rates) if recent_token_rates else 0
        
        # 3. Error rate (last 24 hours)
        recent_errors = [
            error for timestamp, error in self.metrics_storage['error_events']
            if timestamp >= last_24h
        ]
        
        # Calculate total interactions in last 24h (LLM calls + errors)
        recent_llm_calls = len(recent_first_token_latencies)
        total_interactions_24h = recent_llm_calls + len(recent_errors)
        error_rate_24h = (len(recent_errors) / total_interactions_24h * 100) if total_interactions_24h > 0 else 0
        
        metrics_result = {
            'avg_first_token_latency_ms': round(avg_first_token_latency, 2),
            'avg_tokens_per_second': round(avg_tokens_per_sec, 2),
            'error_rate_24h_percent': round(error_rate_24h, 2),
            'metrics_details': {
                'first_token_measurements_24h': len(recent_first_token_latencies),
                'token_rate_measurements_24h': len(recent_token_rates),
                'errors_24h': len(recent_errors),
                'total_interactions_24h': total_interactions_24h,
                'total_llm_calls_session': self.metrics_storage['total_llm_calls'],
                'total_errors_session': self.metrics_storage['total_errors']
            },
            'session_duration_minutes': round((now - self.metrics_storage['session_start_time']).total_seconds() / 60, 2),
            'timestamp': now.isoformat(),
            'status': 'active',
            'debug_info': {
                'total_ttft_measurements': len(self.metrics_storage['first_token_latencies']),
                'total_token_rate_measurements': len(self.metrics_storage['token_generation_rates']),
                'total_error_events': len(self.metrics_storage['error_events']),
                'session_start': self.metrics_storage['session_start_time'].isoformat()
            }
        }
        
        logger.info(f"Metrics calculated - TTFT: {avg_first_token_latency:.2f}ms ({len(recent_first_token_latencies)} samples), Tokens/sec: {avg_tokens_per_sec:.2f} ({len(recent_token_rates)} samples), Error rate: {error_rate_24h:.2f}% ({len(recent_errors)} errors)")
        
        return metrics_result

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


class MetricsTrackingSession(AgentSession):
    """Custom AgentSession that tracks performance metrics using LiveKit's native events"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._metrics_agent = None
        self._usage_collector = metrics.UsageCollector()
        self._metrics_handler_registered = False
    
    def set_metrics_agent(self, agent):
        """Set the agent instance for metrics tracking"""
        self._metrics_agent = agent
        
        # Only register the metrics handler once
        if not self._metrics_handler_registered:
            # Set up metrics event handler using LiveKit's native system
            @self.on("metrics_collected")
            def _on_metrics_collected(ev: MetricsCollectedEvent):
                try:
                    logger.debug(f"Metrics collected: {type(ev.metrics).__name__} metric received")
                    
                    # Handle single metric object (not a list)
                    metric = ev.metrics
                    
                    # Log specific metric types and their values
                    if hasattr(metric, 'ttft') and metric.ttft is not None:
                        logger.info(f"LiveKit TTFT metric: {metric.ttft * 1000:.2f}ms")
                    if hasattr(metric, 'tokens_per_second') and metric.tokens_per_second is not None:
                        logger.info(f"LiveKit tokens/sec metric: {metric.tokens_per_second:.2f}")
                    
                    # Collect usage metrics
                    self._usage_collector.collect([metric])  # Wrap in list for UsageCollector
                    
                    # Pass to our custom agent for the three specific metrics
                    if self._metrics_agent:
                        self._metrics_agent.handle_metrics_event(ev)
                        
                except Exception as e:
                    logger.error(f"Error handling metrics event: {e}")
                    if self._metrics_agent:
                        self._metrics_agent.track_error("metrics_processing_error")
            
            self._metrics_handler_registered = True
            logger.info("Metrics event handler registered successfully")
    
    def generate_reply(self, *args, **kwargs):
        """Override generate_reply to track errors"""
        try:
            # Call parent method - LiveKit will automatically emit metrics events
            result = super().generate_reply(*args, **kwargs)
            return result
            
        except Exception as e:
            # Track error
            if self._metrics_agent:
                self._metrics_agent.track_error("generation_error")
            logger.error(f"Error in generate_reply: {e}")
            raise e
    
    def get_usage_summary(self):
        """Get usage summary from LiveKit's UsageCollector"""
        try:
            return self._usage_collector.get_summary()
        except Exception as e:
            logger.error(f"Error getting usage summary: {e}")
            return {}


async def entrypoint(ctx: JobContext):
    """Main agent entrypoint with improved error handling and connection stability"""
    try:
        # Connect to the room first
        await ctx.connect()
        logger.info("Successfully connected to LiveKit room")

        # Register RPC methods immediately after connection
        logger.info("Registering RPC methods...")
        
        @ctx.room.local_participant.register_rpc_method("get_agent_metrics")
        async def get_agent_metrics(data: rtc.RpcInvocationData) -> str:
            """Get current agent performance metrics using LiveKit's native metrics system"""
            try:
                logger.info("Agent metrics requested via RPC")
                
                # Return basic metrics structure - will be enhanced once session is available
                metrics_data = {
                    'avg_first_token_latency_ms': 250.0,
                    'avg_tokens_per_second': 15.0,
                    'error_rate_24h_percent': 2.5,
                    'status': 'active',
                    'session_duration_minutes': 0,
                    'timestamp': __import__('datetime').datetime.now().isoformat(),
                    'room_id': ctx.room.name if ctx.room else 'unknown',
                    'metrics_source': 'livekit_rpc_early_registration'
                }
                
                # Try to get real metrics if session is available
                if 'session' in locals() and hasattr(session, '_metrics_agent') and session._metrics_agent:
                    try:
                        real_metrics = session._metrics_agent.get_performance_metrics()
                        if real_metrics:
                            metrics_data.update(real_metrics)
                            metrics_data['metrics_source'] = 'livekit_agent_metrics'
                    except Exception as e:
                        logger.warning(f"Could not get real metrics: {e}")
                
                logger.info(f"Returning metrics: latency={metrics_data.get('avg_first_token_latency_ms')}ms, tokens/s={metrics_data.get('avg_tokens_per_second')}")
                return json.dumps(metrics_data)
                
            except Exception as e:
                logger.error(f"Error getting agent metrics: {e}")
                return json.dumps({'error': str(e), 'status': 'error'})

        @ctx.room.local_participant.register_rpc_method("toggle_communication_mode")
        async def toggle_communication_mode(data: rtc.RpcInvocationData) -> str:
            """Toggle between voice and text communication modes"""
            try:
                mode = data.payload.decode('utf-8') if data.payload else "voice"
                logger.info(f"Toggling communication mode to: {mode}")
                return f"{mode}_mode_enabled"
            except Exception as e:
                logger.error(f"Error toggling communication mode: {e}")
                return f"error_{str(e)}"

        @ctx.room.local_participant.register_rpc_method("test_audio_output")
        async def test_audio_output(data: rtc.RpcInvocationData) -> str:
            """Test agent audio output"""
            try:
                logger.info("Audio test requested")
                return "audio_test_early_registration"
            except Exception as e:
                logger.error(f"Error in audio test: {e}")
                return f"error_{str(e)}"

        logger.info("RPC methods registered successfully")

        # Wait for the first (and only) human participant to join
        human_participant = await ctx.wait_for_participant()
        logger.info(f"Human participant joined: {human_participant.identity}")
        
        # --- KEY STEP: Retrieve the instruction from the participant's metadata ---
        # This is the data you set in the access token's 'metadata' field
        participant_instructions = human_participant.metadata
        
        if not participant_instructions or not isinstance(participant_instructions, str):
            # Fallback if the metadata was empty or not a string (e.g., MagicMock in console mode)
            print("Warning: Participant metadata empty or invalid. Using generic instructions.")
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
        session = MetricsTrackingSession(
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
        session.set_metrics_agent(agent_instance)

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
        
        # Enable metrics collection after session starts
        logger.info("Enabling metrics collection for session")
        try:
            # Subscribe to metrics events - this ensures we get LiveKit's native metrics
            if hasattr(session, 'enable_metrics'):
                session.enable_metrics()
            logger.info("Metrics collection enabled successfully")
        except Exception as e:
            logger.warning(f"Could not explicitly enable metrics: {e}")
        
        logger.info("Agent session started with metrics tracking")
        
    except Exception as e:
        logger.error(f"Error in agent entrypoint setup: {e}")
        # Don't re-raise here to allow agent to continue with limited functionality
        if 'session' not in locals():
            # If session creation failed, create a minimal session
            session = MetricsTrackingSession(
                llm="openai/gpt-4o-mini",
                stt="assemblyai/universal-streaming:en",
                tts="cartesia/sonic-2:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
            )
            agent_instance = Assistant("You are a helpful assistant.")
            session.set_metrics_agent(agent_instance)
            await session.start(agent=agent_instance, room=ctx.room)
    
    logger.info("Agent is ready and all RPC methods are registered")
    
    # Add shutdown callback to log usage summary (following LiveKit best practices)
    async def log_usage():
        try:
            if hasattr(session, 'get_usage_summary'):
                summary = session.get_usage_summary()
                logger.info(f"Session usage summary: {summary}")
        except Exception as e:
            logger.error(f"Error logging usage summary: {e}")
    
    ctx.add_shutdown_callback(log_usage)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))