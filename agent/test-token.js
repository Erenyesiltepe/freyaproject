const { AccessToken } = require('livekit-server-sdk');

const apiKey = 'devkey';
const apiSecret = 'secret';
const room = 'agent-console-room';
const identity = 'ai-assistant-agent';

try {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: identity,
    name: identity,
  });

  token.addGrant({
    room: room,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  const jwt = token.toJwt();
  console.log('✅ Token generated successfully');
  console.log('Token length:', jwt.length);
  console.log('Token preview:', jwt.substring(0, 50) + '...');
  
  // Decode token to verify
  const decoded = AccessToken.fromJwt(jwt);
  console.log('✅ Token decoded successfully');
  console.log('Identity:', decoded.identity);
  console.log('Grants:', decoded.grants);
  
} catch (error) {
  console.error('❌ Token generation failed:', error);
}