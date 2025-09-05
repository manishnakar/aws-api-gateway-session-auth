// Lambda authorizer for API Gateway (REQUEST authorizer)
// Node.js 18+
// Expects env: SESSIONS_TABLE, INACTIVITY_SECONDS, REGION, API_AUDIENCE(optional)
import AWS from 'aws-sdk';

// parse cookies helper
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    out[k] = decodeURIComponent((v || []).join('='));
  });
  return out;
}

const REGION = process.env.AWS_REGION || 'us-east-1';
const dynamo = new AWS.DynamoDB.DocumentClient({ region: REGION });
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'sessions';
const INACTIVITY_SECONDS = parseInt(process.env.INACTIVITY_SECONDS || '1800', 10);

function generatePolicy(principalId, effect, resource, context = {}) {
  const policy = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource
      }]
    },
    context
  };
  return policy;
}

export const handler = async (event) => {
  try {
    // event contains headers (REQUEST authorizer)
    const headers = event.headers || {};
    const authHeader = headers.authorization || headers.Authorization;
    let sessionId;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.slice(7);
    } else if (headers.cookie || headers.Cookie) {
      const cookies = parseCookies(headers.cookie || headers.Cookie);
      sessionId = cookies.sid || cookies.sid;
    }

    if (!sessionId) {
      return generatePolicy('anonymous', 'Deny', event.routeArn || event.methodArn, { reason: 'no_session' });
    }

    // fetch session from DynamoDB
    const now = Math.floor(Date.now() / 1000);
    const resp = await dynamo.get({ TableName: SESSIONS_TABLE, Key: { sessionId } }).promise();
    const item = resp.Item;
    if (!item) {
      return generatePolicy('anonymous', 'Deny', event.routeArn || event.methodArn, { reason: 'invalid_session' });
    }

    // check inactivity: if lastActivity too old -> delete and deny
    if ((item.lastActivity || 0) + INACTIVITY_SECONDS < now) {
      await dynamo.delete({ TableName: SESSIONS_TABLE, Key: { sessionId } }).promise();
      return generatePolicy('anonymous', 'Deny', event.routeArn || event.methodArn, { reason: 'session_expired' });
    }

    // update lastActivity and expiresAt (sliding window)
    const expiresAt = now + INACTIVITY_SECONDS;
    await dynamo.update({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
      UpdateExpression: 'SET lastActivity = :now, expiresAt = :exp',
      ExpressionAttributeValues: { ':now': now, ':exp': expiresAt }
    }).promise();

    // allow. Put useful info into context so backend can use it (apiGateway authorizer context values are strings)
    const context = {
      principalId: item.userId,
      sessionId,
      userId: item.userId
    };

    return generatePolicy(item.userId, 'Allow', event.routeArn || event.methodArn, context);

  } catch (err) {
    console.error('authorizer error', err);
    return generatePolicy('anonymous', 'Deny', event.routeArn || event.methodArn, { reason: 'error' });
  }
};
