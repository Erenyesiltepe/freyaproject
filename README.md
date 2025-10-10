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
uv run python src/agent.py start
```

## 🏗️ Architecture Overview

This platform consists of three main components:
- **Next.js Frontend**: Modern dashboard with real-time chat interface, metrics monitoring, and session management
- **Python LiveKit Agent**: AI-powered conversational agent with hybrid voice/text capabilities
- **LiveKit Media Server**: WebRTC infrastructure for real-time audio/video/data communication

## 🎯 Design Notes & Choices

### Key Design Decisions

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

## 🔄 Tradeoffs & Production Considerations

### Current Tradeoffs

#### **Development Approach**
- **Iterative Development**: Used an iterative approach with frequent GitHub pushes, which led to some components becoming lengthy and harder to debug
- **Learning Curve**: First-time agent development resulted in architectural decisions that could be improved with better upfront planning

#### **Technical Debt**
- **Component Complexity**: Some components (especially `live-chat.tsx`) became monolithic and would benefit from decomposition
- **State Management**: Mixed state management patterns that could be unified
- **Error Handling**: Inconsistent error boundaries across components

### What We'd Do Differently for Production

#### **Planning & Architecture**
1. **Detailed API Design**: Plan frontend-agent integration and API endpoints before development
2. **Component Architecture**: Design smaller, more focused components from the start
3. **State Management**: Establish consistent patterns for client vs server state
4. **Testing Strategy**: Implement testing framework from day one, not as an afterthought

#### **Technical Improvements**
1. **Error Handling**: Centralized error tracking and user feedback systems
2. **Performance**: Implement caching strategies and optimize bundle sizes
3. **Security**: Add rate limiting, input validation, and audit logging
4. **Scalability**: Design for horizontal scaling with load balancing
5. **Monitoring**: Comprehensive observability with metrics and tracing

#### **Development Process**
1. **Code Review**: Mandatory peer review process
2. **CI/CD Pipeline**: Automated testing and deployment
3. **Documentation**: Living documentation with architectural decision records
4. **Feature Flags**: Gradual rollout capabilities for new features

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
- `set_session_instructions` - Initialize agent with prompt
- `switch_mode` - Toggle voice/text communication
- `test_audio_output` - Audio device testing

#### **Metrics & Monitoring**
- `get_metrics` - Real-time performance data
- Health endpoint: `GET :4001/health`

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
