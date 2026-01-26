const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * CRA dev proxy (more reliable than package.json "proxy" for some setups/tools).
 * Proxies API + Socket.IO to the Express server on :7000.
 */
module.exports = function (app) {
    const target = process.env.REACT_APP_DEV_PROXY_TARGET || 'http://localhost:7000';

    app.use(
        '/api',
        createProxyMiddleware({
            target,
            changeOrigin: true,
            secure: false,
            logLevel: 'warn',
        })
    );

    // Optional: if you ever switch back to same-origin socket.io in dev, this keeps it working.
    app.use(
        '/socket.io',
        createProxyMiddleware({
            target,
            ws: true,
            changeOrigin: true,
            secure: false,
            logLevel: 'warn',
        })
    );
};


