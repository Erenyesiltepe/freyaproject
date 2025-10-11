# Freya Project - AI Agent Platform

A comprehensive full-stack AI agent platform featuring real-time voice/text interactions, performance monitoring, and advanced session management. Built with Next.js 15, Python LiveKit agents, and modern web technologies.

## 🚀 Quick Setup

### Docker (Recommended)
```bash
# Start the entire application stack
docker-compose up -d --build
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Agent Health**: http://localhost:4001/health

### Local Development Setup

To test locally without Docker, follow the instructions in the README files of the `app/` and `agent/` directories.

**Frontend (app/):**
```bash
cd app
pnpm install
pnpm dev
```

**Agent (agent/):**
```bash
cd agent
uv sync
uv run python src/agent.py console  # Use 'console' for web dashboard integration
```

## 🏗️ Architecture Overview

This platform consists of three main components:
- **Next.js Frontend**: Modern dashboard with real-time chat interface, metrics monitoring, and session management
- **Python LiveKit Agent**: AI-powered conversational agent with hybrid voice/text capabilities and real-time metrics collection
- **LiveKit Media Server**: WebRTC infrastructure for real-time audio/video/data communication

## 🔧 Recent Development Issues & Solutions

### 🐛 **Critical Issues Encountered & Resolved**

#### **1. LiveKit Agent Metrics Integration**

**Problem:** RPC timeout errors when frontend tried to collect real-time metrics from the agent
```
RpcError: Connection timeout
RpcError: Method not supported at destination
```

**Root Causes Identified:**
- RPC methods registered after `session.start()` blocking call
- JSON serialization errors with LiveKit `UsageSummary` objects
- Room name mismatches between frontend and agent
- Component architecture scattered metrics logic across multiple files

**Solutions Implemented:**

1. **RPC Registration Timing Fix**
   ```python
   # BEFORE: RPC methods registered after session.start()
   await session.start(agent=agent_instance, room=ctx.room)
   @ctx.room.local_participant.register_rpc_method("get_agent_metrics")
   
   # AFTER: Early registration immediately after connection
   await ctx.connect()
   @ctx.room.local_participant.register_rpc_method("get_agent_metrics") 
   # ... then start session
   ```

2. **JSON Serialization Fix**
   ```python
   # Fixed UsageSummary serialization
   def make_json_safe(obj):
       if hasattr(obj, '__dict__'):
           return obj.__dict__
       # ... recursive conversion logic
   
   safe_metrics_data = make_json_safe(metrics_data)
   return json.dumps(safe_metrics_data)
   ```

3. **Component Architecture Refactoring**
   ```typescript
   // BEFORE: Metrics logic scattered in live-chat.tsx
   // AFTER: Centralized in dedicated metrics.tsx component
   
   // Shared LiveKit state between components
   <LiveChat onLiveKitStateChange={(room, isConnected) => {
     setLivekitRoom(room);
     setLivekitConnected(isConnected);
   }} />
   <Metrics livekitRoom={livekitRoom} isConnected={livekitConnected} />
   ```

#### **2. Database Performance vs Real-time Requirements**

**Problem:** Initial design stored metrics in database, causing delays and stale data

**Design Decision:** Removed database storage for metrics in favor of direct agent RPC calls
- **Pros:** Real-time data, no database overhead, eliminates data lag
- **Cons:** No historical metrics persistence, agent dependency for metrics
- **Outcome:** Improved user experience with live performance monitoring

### 🎯 Design Decisions & Architecture Changes

#### **Metrics Collection Strategy Evolution**

**Phase 1: Database-Centric** (Deprecated)
```typescript
// Store metrics in PostgreSQL/SQLite
POST /api/metrics -> Database -> GET /api/metrics -> Frontend
```

**Phase 2: Real-time RPC** (Current)
```typescript
// Direct agent communication
Frontend -> LiveKit RPC -> Agent -> Immediate Response
```

**Rationale:** User experience prioritized over data persistence for metrics

#### **Component Architecture Refactoring**

**Before:** Monolithic live-chat component handling chat + metrics
```typescript
// live-chat.tsx (1240+ lines)
- Chat functionality
- Metrics collection
- Automatic polling
- Display logic
```

**After:** Separation of concerns
```typescript
// live-chat.tsx: Chat-focused
// metrics.tsx: Metrics-focused  
// console/page.tsx: State orchestration
```

**Benefits:**
- Better maintainability
- Clear component responsibilities
- Easier testing and debugging
- Reusable metrics component

## 🎯 Design Notes & Choices

### Key Design Decisions

#### **Real-time Metrics Architecture**
We implemented a **direct RPC communication** system between the frontend and agent for metrics collection, abandoning the initial database-centric approach. This provides sub-second latency for performance monitoring at the cost of historical data persistence.

#### **Component State Management**
Chose a **shared state architecture** where the main console page orchestrates LiveKit state between the chat and metrics components, ensuring consistent connection status and room data across the application.

#### **Remote User Metadata vs Room Metadata**
We chose to use **remote-user metadata** instead of room metadata to pass initial prompts to the agent. This decision was made because room metadata consistently returned `None` in our testing environment, while remote-user metadata proved reliable for prompt transmission.

#### **Frontend Architecture**
- **Next.js 15 with App Router**: Leveraging server components for optimal performance
- **TanStack Query**: Chosen for robust server state management and automatic caching
- **SQLite + Prisma**: Simple, reliable database solution with type-safe operations
- **LiveKit SDK**: WebRTC-based real-time communication for low-latency interactions

#### **Backend Architecture**
- **Python Agent**: Selected over Node.js due to better documentation and resource availability for LiveKit agents
- **Modular Pipeline**: STT → LLM → TTS with configurable AI providers
- **HTTP-only Cookies**: Secure authentication without client-side token exposure

### Technology Rationale

**Why Python for the Agent?**
- Rich LiveKit documentation and examples available
- Extensive AI/ML ecosystem (OpenAI, Anthropic, etc.)
- Better community support for voice agent development

**Why Next.js for Frontend?**
- Full-stack capabilities with API routes
- Excellent TypeScript integration
- Modern React patterns with server components
- Built-in optimization and caching

## 📊 Performance Monitoring Implementation

### Real-time Metrics System

**Current Architecture:**
```
Frontend (metrics.tsx) 
    ↓ RPC Call every 10s
LiveKit Room
    ↓ performRpc("get_agent_metrics")  
Python Agent
    ↓ JSON Response
Real-time Dashboard Display
```

**Key Metrics Tracked:**
- **First Token Latency**: Time to first LLM response token
- **Tokens per Second**: LLM generation speed
- **Error Rate (24h)**: Percentage of failed interactions
- **Connection Status**: Real-time agent availability

**Implementation Details:**
```typescript
// Automatic metrics collection with error handling
const requestAgentMetrics = useCallback(async () => {
  if (!livekitRoom || !isConnected) return;
  
  try {
    const result = await livekitRoom.localParticipant.performRpc({
      destinationIdentity: agentParticipant?.identity || '',
      method: 'get_agent_metrics',
      payload: 'request'
    });
    
    const metricsData = JSON.parse(result);
    setRealtimeMetrics(metricsData);
  } catch (error) {
    console.error('Metrics collection failed:', error);
    setRealtimeMetrics(null); // Show disconnected state
  }
}, [livekitRoom, isConnected]);
```

### Error Handling & Resilience

**Connection State Management:**
- Visual indicators for agent connectivity
- Graceful degradation when agent unavailable  
- Automatic retry mechanisms with exponential backoff
- Clear user feedback for connection issues
- **Next.js 15 with App Router**: Leveraging server components for optimal performance
- **TanStack Query**: Chosen for robust server state management and automatic caching
- **SQLite + Prisma**: Simple, reliable database solution with type-safe operations
- **LiveKit SDK**: WebRTC-based real-time communication for low-latency interactions

#### **Backend Architecture**
- **Python Agent**: Selected over Node.js due to better documentation and resource availability for LiveKit agents
- **Modular Pipeline**: STT → LLM → TTS with configurable AI providers
- **HTTP-only Cookies**: Secure authentication without client-side token exposure

### Technology Rationale

**Why Python for the Agent?**
- Rich LiveKit documentation and examples available
- Extensive AI/ML ecosystem (OpenAI, Anthropic, etc.)
- Better community support for voice agent development

**Why Next.js for Frontend?**
- Full-stack capabilities with API routes
- Excellent TypeScript integration
- Modern React patterns with server components
- Built-in optimization and caching

## 🔄 Tradeoffs & Production Considerations

### Current Tradeoffs

#### **Development Approach**
- **Iterative Development**: Used an iterative approach with frequent GitHub pushes, which led to some components becoming lengthy and harder to debug
- **Learning Curve**: First-time agent development resulted in architectural decisions that could be improved with better upfront planning
- **Real-time vs Persistence**: Chose real-time metrics over historical data storage for better UX

#### **Technical Debt**
- **Component Complexity**: Some components (especially `live-chat.tsx`) became monolithic and would benefit from decomposition
- **State Management**: Mixed state management patterns that could be unified  
- **Error Handling**: Inconsistent error boundaries across components
- **RPC Method Management**: Early vs late registration patterns need standardization

### What We'd Do Differently for Production

#### **Planning & Architecture**
1. **Detailed API Design**: Plan frontend-agent integration and API endpoints before development
2. **Component Architecture**: Design smaller, more focused components from the start
3. **State Management**: Establish consistent patterns for client vs server state
4. **Testing Strategy**: Implement testing framework from day one, not as an afterthought
5. **RPC Lifecycle**: Design clear patterns for agent method registration and lifecycle management

#### **Technical Improvements**
1. **Error Handling**: Centralized error tracking and user feedback systems
2. **Performance**: Implement caching strategies and optimize bundle sizes
3. **Security**: Add rate limiting, input validation, and audit logging
4. **Scalability**: Design for horizontal scaling with load balancing
5. **Monitoring**: Comprehensive observability with metrics and tracing
6. **Metrics Persistence**: Hybrid approach with real-time display + background storage

#### **Development Process**
1. **Code Review**: Mandatory peer review process
2. **CI/CD Pipeline**: Automated testing and deployment
3. **Documentation**: Living documentation with architectural decision records
4. **Feature Flags**: Gradual rollout capabilities for new features
5. **Agent Testing**: Automated RPC method testing and validation

## 🛠️ Debugging & Development Insights

### Common Development Patterns

**LiveKit Agent Debugging:**
```bash
# Start agent with verbose logging
uv run python src/agent.py console --log-level debug

# Check RPC method registration
grep -n "register_rpc_method" src/agent.py

# Monitor real-time metrics
curl http://localhost:4001/health
```

**Frontend Debugging:**
```javascript
// Check LiveKit connection state
console.log({
  room: livekitRoom?.name,
  connected: isConnected, 
  participants: livekitRoom?.remoteParticipants.size
});

// Monitor RPC calls
livekitRoom.localParticipant.performRpc({
  method: 'get_agent_metrics',
  payload: 'request'
}).then(console.log).catch(console.error);
```

### Lessons Learned

**1. RPC Method Timing is Critical**
- Register RPC methods immediately after connection
- Don't wait for session initialization to complete
- Early registration prevents "Method not supported" errors

**2. JSON Serialization Requires Care**
- LiveKit objects often aren't directly serializable
- Implement recursive safety conversion for complex objects
- Test serialization with real agent data, not just mocks

**3. Component State Sharing Patterns**
- Callback-based state sharing works well for parent-child communication
- Centralized state management in parent components reduces prop drilling
- Consider React Context for deeply nested state needs

## 📡 API Overview

### Frontend API Routes (`/api/*`)

#### **Authentication**
- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - Session termination
- `GET /api/auth/me` - Current user info

#### **Session Management**
- `GET /api/sessions` - List user sessions
- `POST /api/sessions` - Create new session
- `PATCH /api/sessions` - Update session (end/modify)
- `GET /api/sessions/[id]` - Get specific session

#### **Messages**
- `GET /api/messages` - Get session messages
- `POST /api/messages` - Create new message

#### **Prompts**
- `GET /api/prompts` - List available prompts
- `POST /api/prompts` - Create custom prompt
- `DELETE /api/prompts/[id]` - Remove prompt

#### **Monitoring**
- `GET /api/health` - Service health check
- `GET /api/metrics` - Performance metrics

### Agent RPC Methods

#### **Session Control**
- `toggle_communication_mode` - Switch between voice/text modes
- `test_audio_output` - Audio device testing

#### **Metrics & Monitoring**
- `get_agent_metrics` - Real-time performance data (avg_first_token_latency_ms, avg_tokens_per_second, error_rate_24h_percent)
- Health endpoint: `GET :4001/health`

**RPC Implementation Notes:**
```python
# Early registration pattern (critical for frontend integration)
await ctx.connect()

@ctx.room.local_participant.register_rpc_method("get_agent_metrics")
async def get_agent_metrics(data: rtc.RpcInvocationData) -> str:
    # JSON-safe metrics response
    return json.dumps(make_json_safe(metrics_data))
```

## 🧪 Tests

### Backend Tests (API Routes)

#### **Streaming Generator Tests**
```typescript
// Token rate calculation and streaming response tests
describe('Message Streaming', () => {
  it('calculates token rate correctly for streaming responses', async () => {
    // Test token-per-second calculation accuracy
  });
  
  it('handles streaming interruption gracefully', async () => {
    // Test error recovery during token streaming
  });
});
```

#### **Token Rate Calculation Tests**
```typescript
describe('Token Rate Metrics', () => {
  it('calculates accurate tokens per second', async () => {
    // Verify precision of performance metrics
  });
  
  it('handles zero-duration edge cases', async () => {
    // Test mathematical edge cases
  });
});
```

#### **Error Pathway Tests**
```typescript
describe('Error Handling', () => {
  it('handles database connection failures', async () => {
    // Test database error recovery
  });
  
  it('manages authentication failures properly', async () => {
    // Test auth error scenarios
  });
  
  it('handles malformed request payloads', async () => {
    // Test input validation errors
  });
});
```

#### **Authentication & Security Tests**
```typescript
describe('Security Tests', () => {
  it('prevents unauthorized session access', async () => {
    // Test session isolation
  });
  
  it('validates cookie security in production', async () => {
    // Test cookie flags and security
  });
});
```

#### **Session Management Tests**
```typescript
describe('Session Lifecycle', () => {
  it('creates sessions with proper prompt association', async () => {
    // Test session creation flow
  });
  
  it('handles concurrent session operations', async () => {
    // Test race condition handling
  });
});
```

### Frontend Tests (Components & Integration)

#### **Component Integration Test**
```typescript
describe('PromptLibrary Component', () => {
  it('integrates with session creation flow', async () => {
    const mockOnStartSession = jest.fn();
    render(<PromptLibrary onStartSession={mockOnStartSession} />);
    
    // Test full user interaction flow
    const startButton = screen.getAllByText('Start Session')[0];
    await user.click(startButton);
    
    expect(mockOnStartSession).toHaveBeenCalledWith('prompt-1');
  });
  
  it('handles error states gracefully', async () => {
    // Test error boundary behavior
  });
  
  it('manages loading states during API calls', async () => {
    // Test async state management
  });
});
```

### Running Tests

```bash
# Install dependencies
cd app
pnpm install

# Run all tests (66 total tests)
pnpm test

# Run specific test suites
pnpm test -- src/__tests__/api/        # Backend tests
pnpm test -- src/__tests__/components/ # Frontend tests

# Run with coverage
pnpm test -- --coverage

# Watch mode for development
pnpm test:watch
```

### Test Coverage Summary
- **Authentication API**: 14 tests (login, logout, security)
- **Messages API**: 11 tests (CRUD, streaming, validation)
- **Sessions API**: 15 tests (lifecycle, LiveKit integration)
- **Prompts API**: 12 tests (management, authorization)
- **Frontend Components**: 14 tests (user interactions, state management)

**Total: 66 comprehensive tests** covering all major functionality

## 🔮 Future Enhancements

### Immediate Production Needs
1. **Comprehensive Error Tracking**: Centralized logging with Sentry
2. **Rate Limiting**: API protection and quota management
3. **Input Validation**: Enhanced security and data integrity
4. **Performance Monitoring**: APM integration for production insights
5. **Horizontal Scaling**: Multi-instance deployment strategies

### Advanced Features
1. **Multi-language Support**: Internationalization framework
2. **Custom AI Models**: Support for local LLM deployment
3. **Team Collaboration**: Multi-user session sharing
4. **Advanced Analytics**: Conversation quality metrics
5. **Real-time Collaboration**: Shared sessions and multiplayer support

## 📄 License

This project is developed for demonstration and educational purposes. Please ensure proper API key management and security practices in production deployments.
