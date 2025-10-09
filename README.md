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

### 1. Launch LiveKit Server

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

### 2. Start the Python Agent

```powershell
cd agent-starter-python
uv sync  # Install dependencies
uv run python src/agent.py dev  # Start in development mode
```

### 3. Launch the Next.js Frontend

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
│   └── package.json              # Frontend dependencies
├── agent-starter-python/         # Python LiveKit Agent
│   ├── src/
│   │   └── agent.py              # Main agent implementation
│   ├── pyproject.toml            # Python dependencies
│   └── uv.lock                   # Dependency lock file
├── docker-compose.yml            # Container orchestration
├── livekit.yaml                  # LiveKit server configuration
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

### **Testing Strategy**
- **Build Verification**: Automated TypeScript compilation
- **Component Testing**: Manual testing with live agent
- **Performance Monitoring**: Real-time metrics validation

### **Deployment Considerations**
- **Docker Support**: Container-ready configuration
- **Environment Parity**: Consistent dev/prod environments
- **Database Migrations**: Prisma-managed schema evolution

## 🚨 Troubleshooting

### **Common Issues**

#### **LiveKit Connection Errors**
```bash
# Verify LiveKit server is running
curl http://localhost:7880/rtc/validate

# Check port availability
netstat -an | findstr 7880
```

#### **Agent Connection Issues**
```bash
# Verify environment variables
uv run python -c "import os; print(os.getenv('LIVEKIT_URL'))"

# Test agent connectivity
uv run python src/agent.py --validate-connection
```

#### **Frontend Build Errors**
```bash
# Clear Next.js cache
pnpm clean

# Regenerate Prisma client
pnpm prisma generate

# Reset database
pnpm prisma db push --force-reset
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
- **End-to-End Testing**: Automated integration tests
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
