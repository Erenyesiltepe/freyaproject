import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { roomName, identity, sessionId } = await request.json();

    console.log('Token request received:', { roomName, identity, sessionId });

    if (!roomName || !identity) {
      return NextResponse.json(
        { error: 'Missing roomName or identity' },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error('Missing LiveKit credentials');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get session information if sessionId is provided
    let participantMetadata = '';
    if (sessionId) {
      try {
        const session = await prisma.session.findUnique({
          where: { id: sessionId },
          include: { prompt: { select: { body: true, title: true } } }
        });
        
        if (session?.prompt) {
          participantMetadata = JSON.stringify({
            agent_instructions: session.prompt.body,
            prompt_title: session.prompt.title,
            session_id: session.id
          });
          console.log('Participant metadata set:', { sessionId, promptTitle: session.prompt.title });
        }
      } catch (error) {
        console.error('Failed to fetch session for metadata:', error);
      }
    }

    // Generate access token
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
      metadata: participantMetadata
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomRecord: false,
      roomAdmin: false
    });

    const jwt = await token.toJwt();

    return NextResponse.json({ token: jwt });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}