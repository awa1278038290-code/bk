export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/rpc') {
      if (!env.API_ORIGIN) {
        return new Response('Missing API_ORIGIN. Set it to your public backend origin.', {
          status: 500
        });
      }

      const upstream = new URL('/rpc', env.API_ORIGIN);
      return fetch(upstream, request);
    }

    return env.ASSETS.fetch(request);
  }
};
