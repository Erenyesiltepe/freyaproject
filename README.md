# Freya Project - AI Agent Platform

A comprehensive full-stack AI agent platform featuring real-time voice/text interactions, performance monitoring, and advanced session management. Built with Next.js 15, Python LiveKit agents, and modern web technologies.

## 🏗️ Architecture Overview

This platform consists of three main components:
- **Next.js Frontend**: Modern dashboard with real-time chat interface, metrics monitoring, and session management
- **Python LiveKit Agent**: AI-powered conversational agent with hybrid voice/text capabilities
- **LiveKit Media Server**: WebRTC infrastructure for real-time audio/video/data communication

## ✨ Key Features

### 🤖 **AI Agent Capabilities**
- **Hybrid Communication**: Seamless switching between voice and text modes
- **Real-time Audio**: Low-latency voice interactions with TTS/STT
- **Smart Responses**: GPT-4o-mini powered conversations with function calling
- **Performance Tracking**: Comprehensive metrics collection and analysis

### 📊 **Dashboard & Analytics**
- **Live Metrics**: Real-time performance monitoring (latency, tokens/sec, error rates)
- **Session Management**: Create, track, and analyze conversation sessions
- **Prompt Library**: Reusable conversation starters with tagging system
- **Activity Logs**: Last 20 system events with detailed component tracking

### 🎯 **User Experience**
- **Keyboard Shortcuts**: Command-K for quick actions, enhanced navigation
- **Auto-scroll**: Smart message scrolling with hover pause functionality
- **Toast Notifications**: Real-time feedback for user actions and system events
- **Dark Theme**: Modern, consistent UI across all components
- **Audio Device Control**: Microphone and speaker selection with testing
- **Real-time Updates**: TanStack Query-powered caching and background sync
- **Responsive Design**: Works seamlessly across desktop and mobile

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** with pnpm
- **Python 3.11+** with uv package manager
- **Docker Desktop** for LiveKit server
- **Environment Variables** (see Configuration section)

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# Required: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL
# Required: OPENAI_API_KEY or GOOGLE_API_KEY
```

### 2. Launch Full Stack with Docker

```bash
# Start all services (Next.js app, Python agent, database)
docker compose up --build

# Or run in background
docker compose up -d --build
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Agent Health**: http://localhost:4001/health

### 3. Alternative: Development Setup

If you prefer to run services individually for development:

#### Start LiveKit Server (if using self-hosted)
```powershell
# Using Docker Compose (recommended)
docker compose up livekit

# Or run directly
docker run --rm -it \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  -p 50000-50010:50000-50010/udp \
  -v "${PWD}/livekit.yaml:/livekit.yaml" \
  livekit/livekit-server:latest \
  --config /livekit.yaml
```

#### Start the Python Agent

```powershell
cd agent
uv sync  # Install dependencies
uv run python src/agent.py start  # Start in production mode
```

#### Launch the Next.js Frontend

```powershell
cd app
pnpm install  # Install dependencies
pnpm dev      # Start development server
```

Visit `http://localhost:3000` to access the platform.

## 📁 Project Structure

```
freyaproject/
├── app/                          # Next.js 15 Frontend
│   ├── src/
│   │   ├── app/                  # App Router Pages
│   │   │   ├── api/              # API Routes
│   │   │   │   ├── auth/         # Authentication endpoints
│   │   │   │   ├── messages/     # Message CRUD operations
│   │   │   │   ├── metrics/      # Performance metrics API
│   │   │   │   ├── prompts/      # Prompt library management
│   │   │   │   └── sessions/     # Session management
│   │   │   ├── console/          # Main dashboard page
│   │   │   ├── login/            # Authentication page
│   │   │   └── test-agent/       # Agent testing interface
│   │   ├── components/           # React Components
│   │   │   ├── ui/               # Shadcn/ui base components
│   │   │   ├── live-chat.tsx     # Main chat interface
│   │   │   ├── metrics.tsx       # Performance monitoring
│   │   │   ├── prompt-library.tsx # Prompt management
│   │   │   └── recent-sessions.tsx # Session history
│   │   ├── __tests__/            # Test Suites (66 tests total)
│   │   │   ├── api/              # API endpoint tests
│   │   │   │   ├── auth.test.ts  # Authentication tests (14)
│   │   │   │   ├── messages.test.ts # Messages API tests (11)
│   │   │   │   ├── prompts.test.ts # Prompts API tests (12)
│   │   │   │   └── sessions.test.ts # Sessions API tests (15)
│   │   │   └── components/       # Component tests
│   │   │       └── prompt-library.test.tsx # PromptLibrary tests (14)
│   │   ├── contexts/             # React Context Providers
│   │   │   └── SessionContext.tsx # Session state management
│   │   └── lib/                  # Utilities & Configuration
│   │       ├── auth.ts           # Authentication logic
│   │       ├── livekit.ts        # LiveKit client integration
│   │       ├── prisma.ts         # Database client
│   │       ├── queries.ts        # TanStack Query hooks
│   │       └── query-provider.tsx # Query client provider
│   ├── prisma/                   # Database Schema & Migrations
│   │   ├── schema.prisma         # Database models
│   │   └── migrations/           # Database migrations
│   ├── jest.config.js            # Jest testing configuration
│   ├── jest.setup.js             # Jest environment setup
│   └── package.json              # Frontend dependencies
├── agent/                        # Python LiveKit Agent
│   ├── src/
│   │   └── agent.py              # Main agent implementation with health endpoint
│   ├── pyproject.toml            # Python dependencies
│   ├── uv.lock                   # Dependency lock file
│   ├── .env.example              # Environment template
│   └── Dockerfile                # Docker build configuration
├── docker-compose.yml            # Full stack orchestration
├── .env.example                  # Environment variables template
└── README.md                     # This file
```

## 🛠️ Configuration

### Environment Variables

#### Frontend (`app/.env.local`)
```env
# Database
DATABASE_URL="file:./dev.db"

# LiveKit Configuration
NEXT_PUBLIC_LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="your-api-key"
LIVEKIT_API_SECRET="your-api-secret"

# Authentication
JWT_SECRET="your-jwt-secret"
```

#### Agent (`agent-starter-python/.env.local`)
```env
# LiveKit Configuration
LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="your-api-key"
LIVEKIT_API_SECRET="your-api-secret"

# AI Provider Keys
OPENAI_API_KEY="your-openai-key"
ASSEMBLYAI_API_KEY="your-assemblyai-key"
CARTESIA_API_KEY="your-cartesia-key"
```

## 🧪 Testing Setup

### **Test Infrastructure**
- **Jest**: Testing framework with custom Next.js configuration
- **React Testing Library**: Component testing utilities
- **Advanced Mocking**: Custom mocks for Request/Response, Headers, cookies, and external APIs
- **Database Testing**: Isolated test database with automatic cleanup

### **Running Tests**
```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run tests in watch mode during development
pnpm test:watch

# Run specific test suites
pnpm test -- src/__tests__/api/
pnpm test -- src/__tests__/components/
```

### **Test Coverage**
The platform includes comprehensive test coverage across:
- **API Endpoints**: Authentication, CRUD operations, error handling
- **Business Logic**: Session management, LiveKit integration, prompt handling
- **UI Components**: User interactions, state management, rendering
- **Security**: Cookie handling, environment-specific configurations

## 🐳 Docker Setup

### **Service Architecture**
- **app**: Next.js frontend with API routes, database, and health checks
- **agent**: Python LiveKit agent with health endpoint and RPC methods
- **db**: SQLite database persistence layer

### **Health Checks**
All services include health checks for reliable deployments:
- **Frontend**: `/api/health` endpoint returns service status
- **Agent**: `/health` endpoint on port 4001 for container health
- **Database**: File existence check for SQLite database

### **Volumes**
- **app_data**: Persistent storage for uploads and cache
- **db_data**: SQLite database persistence across container restarts

### **Networking**
Services communicate internally using Docker networks. External access:
- Frontend: http://localhost:3000
- Agent Health: http://localhost:4001/health

## 🎯 Design Decisions

### **Frontend Architecture**

#### **Next.js 15 with App Router**
- **Server Components**: Optimal performance with RSC
- **API Routes**: Serverless backend functionality
- **TypeScript**: Full type safety across the codebase

#### **State Management Strategy**
- **TanStack Query**: Server state caching and synchronization
- **React Context**: Client-side state (sessions, UI state)
- **Local Storage**: User preferences (audio devices, themes)

#### **Real-time Communication**
- **LiveKit SDK**: WebRTC-based audio/video/data channels
- **Custom Hooks**: Abstracted LiveKit integration (`useLiveKit`)
- **Message Streaming**: Token-by-token response rendering

### **Backend Architecture**

#### **Database Design (SQLite + Prisma)**
```sql
-- Core entities with relationships
User → Session → Message
User → Prompt
Session → Prompt (via foreign key)
```

#### **API Design Patterns**
- **RESTful Routes**: Consistent CRUD operations
- **HTTP-only Cookies**: Secure authentication
- **Error Handling**: Standardized error responses
- **Rate Limiting**: Built-in protection (future enhancement)

### **Agent Architecture**

#### **Python LiveKit Agent**
- **Modular Pipeline**: STT → LLM → TTS with configurable providers
- **RPC Methods**: Dynamic mode switching and metrics retrieval
- **Performance Tracking**: Built-in latency and token rate monitoring
- **Error Recovery**: Graceful handling of provider failures

#### **AI Provider Integration**
- **LLM**: OpenAI GPT-4o-mini for conversational AI
- **STT**: AssemblyAI for speech-to-text transcription
- **TTS**: Cartesia Sonic for natural voice synthesis
- **Function Calling**: Extensible tool system

## 📊 Performance & Monitoring

### **Metrics Collection**
- **First Token Latency**: Time to first response token
- **Tokens per Second**: Response generation speed
- **Error Rate**: Failed request percentage (24h window)
- **Activity Logs**: Real-time system event tracking

### **Caching Strategy**
- **Query Cache**: 2-15 minute stale times based on data freshness
- **Background Sync**: Auto-refresh for real-time metrics
- **Optimistic Updates**: Instant UI feedback for user actions
- **Smart Invalidation**: Targeted cache updates on mutations

### **Audio Device Management**
- **Device Enumeration**: Real-time microphone/speaker detection
- **setSinkId Support**: Dynamic audio output routing
- **Device Testing**: Built-in audio test functions
- **Preference Persistence**: User settings saved locally

## 🎨 UI/UX Design

### **Component Architecture**
- **Atomic Design**: Reusable UI components via Shadcn/ui
- **Dark Theme**: Consistent color palette and styling
- **Responsive Layout**: CSS Grid and Flexbox for all screen sizes
- **Accessibility**: ARIA labels and keyboard navigation

### **User Journey**
1. **Authentication**: Simple email-based login system
2. **Dashboard**: Three-column layout (Prompts | Chat | Metrics)
3. **Session Creation**: Start conversations from prompt library
4. **Interaction**: Switch between voice/text modes seamlessly
5. **Monitoring**: Real-time performance and activity tracking

## 🔧 Development Workflow

### **Code Quality**
- **TypeScript**: Strict type checking across frontend
- **ESLint**: Code linting and formatting standards
- **Prisma**: Type-safe database operations
- **Error Boundaries**: Graceful error handling
- **Automated Testing**: Comprehensive test suite with 66+ tests

### **Testing Commands**
```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test -- src/__tests__/api/auth.test.ts
```

### **Testing Strategy**
- **Comprehensive Test Suite**: 66 automated tests covering all major functionality
- **API Testing**: Full backend coverage with authentication, validation, and error scenarios
- **Component Testing**: React component testing with user interaction simulation
- **Mock Infrastructure**: Advanced mocking for Next.js, Prisma, LiveKit, and external APIs
- **CI/CD Ready**: Jest-based testing framework with detailed reporting

### **Test Coverage**
- **Authentication API** (14 tests): Login, logout, user creation, cookie security, environment handling
- **Messages API** (11 tests): CRUD operations with token processing and validation
- **Sessions API** (15 tests): Session management, LiveKit integration, prompt association
- **Prompts API** (12 tests): Prompt library management with authorization and tagging
- **Frontend Components** (14 tests): PromptLibrary component with full user interaction coverage

### **Deployment Considerations**
- **Docker Support**: Container-ready configuration
- **Environment Parity**: Consistent dev/prod environments
- **Database Migrations**: Prisma-managed schema evolution

## 🚨 Troubleshooting

### **Common Issues**

#### **Docker Compose Issues**
```bash
# Check service status
docker compose ps

# View service logs
docker compose logs app
docker compose logs agent
docker compose logs db

# Restart specific service
docker compose restart app

# Rebuild and restart all services
docker compose up --build --force-recreate
```

#### **Environment Configuration**
```bash
# Validate environment variables
docker compose exec app printenv | grep LIVEKIT
docker compose exec agent printenv | grep LIVEKIT

# Check if .env file is properly loaded
docker compose exec app cat .env
```

#### **Agent Connection Issues**
```bash
# Check agent health endpoint
curl http://localhost:4001/health

# View agent logs
docker compose logs agent

# Test LiveKit connection from agent
docker compose exec agent python -c "import os; print('LIVEKIT_URL:', os.getenv('LIVEKIT_URL'))"
```

#### **Frontend Build Errors**
```bash
# Clear Next.js cache and rebuild
docker compose exec app rm -rf .next
docker compose restart app

# Check frontend logs
docker compose logs app

# Reset database
docker compose exec app npx prisma db push --force-reset
```

### **Performance Optimization**
- **Audio Latency**: Ensure consistent network conditions
- **Database Queries**: Monitor Prisma query performance
- **Memory Usage**: Agent memory consumption with long sessions
- **WebRTC Issues**: Browser compatibility and firewall settings

## 🔮 Future Enhancements

### **Planned Features**
- **Multi-language Support**: Internationalization framework
- **Advanced Analytics**: Conversation quality metrics
- **Custom AI Models**: Support for local LLM deployment
- **Team Collaboration**: Multi-user session sharing
- **API Rate Limiting**: Enhanced security and quota management

### **Technical Improvements**
- **End-to-End Testing**: Comprehensive automated test suite implemented ✅
- **Performance Profiling**: Detailed agent performance analysis
- **Error Tracking**: Centralized error monitoring (Sentry)
- **Horizontal Scaling**: Multi-agent deployment strategies

## 📄 License

This project is developed for demonstration and educational purposes. Please ensure proper API key management and security practices in production deployments.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For detailed development guidelines, see the inline code documentation and component-level README files.
