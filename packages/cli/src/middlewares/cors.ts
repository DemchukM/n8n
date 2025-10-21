import type { RequestHandler } from 'express';

export const corsMiddleware: RequestHandler = (req, res, next) => {
	// Determine origin and requested CORS details
	const origin = (req.headers.origin as string | undefined) ?? undefined;
	const reqHeaders =
		(req.headers['access-control-request-headers'] as string | undefined) ?? undefined;
	const reqMethod =
		(req.headers['access-control-request-method'] as string | undefined) ?? undefined;

	// Always set permissive CORS headers
	if (origin) {
		// Reflect caller origin and allow credentials
		res.header('Access-Control-Allow-Origin', origin);
		res.header('Vary', 'Origin');
		res.header('Access-Control-Allow-Credentials', 'true');
	} else {
		// No origin header (non-CORS or same-origin) — allow any origin without credentials
		res.header('Access-Control-Allow-Origin', '*');
	}

	// Allow the requested method if provided, otherwise a safe superset
	res.header('Access-Control-Allow-Methods', reqMethod ?? 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

	// Allow requested headers if provided; otherwise a comprehensive default list
	res.header(
		'Access-Control-Allow-Headers',
		reqHeaders ??
			'Origin, X-Requested-With, Content-Type, Accept, Authorization, push-ref, browser-id, anonymousid',
	);

	// Reduce preflight frequency
	res.header('Access-Control-Max-Age', '86400'); // 24 hours

	// Optionally expose common headers
	res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Date, ETag');

	if (req.method === 'OPTIONS') {
		res.status(204).end();
		return;
	}

	next();
};
