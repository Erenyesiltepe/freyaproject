import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export async function POST(request: NextRequest) {
  try {
    const { roomName, identity } = await request.json();

    if (!roomName || !identity) {
      return NextResponse.json(
        { error: 'Missing roomName or identity' },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error('Missing LiveKit credentials');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Generate access token
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
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