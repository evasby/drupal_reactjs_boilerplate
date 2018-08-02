const compression = require('compression');
const express = require('express');
const nextjs = require('next');
const sass = require('node-sass');
const globImporter = require('node-sass-glob-importer');
const dotenv = require('dotenv');
const routes = require('./routes');

// For Platform.sh we need to find the backend url in mapped routes.
if (process.env.PLATFORM_PROJECT) {
  // Load platform.sh routes config.
  // eslint-disable-next-line no-buffer-constructor
  const plaformshRoutes = JSON.parse(new Buffer(process.env.PLATFORM_ROUTES, 'base64').toString());
  for (const url in plaformshRoutes) { // eslint-disable-line no-restricted-syntax, guard-for-in
    const route = plaformshRoutes[url];
    if (route.original_url === 'https://{default}/admin/') {
      // Remove "/" from the end of the url.
      process.env.BACKEND_URL = url.substring(0, url.length - 1);
    }
  }
} else {
  // Import variables (including BACKEND_URL) from local .env file.
  dotenv.config();
}

const port = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = nextjs({ dev });
const handler = routes.getRequestHandler(app);

app.prepare()
  .then(() => {
    // Initialize express.js server.
    const expressServer = express();

    // Serve gzipped content where possible.
    expressServer.use(compression());

    // Add route to serve compiled SCSS from /assets/{build id}/main.css
    // Note: This is only used in production, in development css is inline.
    const sassResult = sass.renderSync({
      file: './styles/theme.scss',
      outputStyle: 'compressed',
      importer: globImporter(),
    });

    expressServer.get('/assets/:id/main.css', (req, res) => {
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('Cache-Control', 'public, max-age=2592000');
      res.setHeader('Expires', new Date(Date.now() + 2592000000).toUTCString());
      res.send(sassResult.css);
    });

    // Send robots.txt file from /static folder.
    const options = {
      root: `${__dirname}/static/`,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
    };
    expressServer.get('/robots.txt', (req, res) => (
      res.status(200).sendFile('robots.txt', options)
    ));

    // Set browser caching for all static files.
    expressServer.use('/static', express.static(`${__dirname}/static`, {
      maxAge: '7d',
    }));

    expressServer.get('*', (req, res) => handler(req, res));

    expressServer.listen(port, (err) => {
      if (err) throw err;
      // eslint-disable-next-line no-console
      console.log('> Application is ready to serve!');
    });
  });