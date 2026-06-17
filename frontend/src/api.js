const RPC_URL = import.meta.env.VITE_RPC_URL || '/rpc';

let rpcId = 1;

export async function rpc(method, params = {}) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcId++,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message);
  }
  return payload.result;
}

