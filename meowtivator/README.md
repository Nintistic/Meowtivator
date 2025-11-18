# Meowtivator: Quest Log

A retro pixel-themed quest management app built with React and Firebase.

## Environment Setup

Before running the app, you need to set up your environment variables:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Firebase configuration values in `.env`:
   - Get your Firebase config from the Firebase Console
   - Add all the required `REACT_APP_FIREBASE_*` variables

3. (Optional) Add Spotify configuration if you want Spotify integration:
   - `REACT_APP_SPOTIFY_CLIENT_ID`
   - `REACT_APP_SPOTIFY_REDIRECT_URI`

**Important:** Never commit your `.env` file to git. It's already in `.gitignore`.

## Docker Deployment

The application can be easily containerized using Docker for consistent deployment across different environments.

### Prerequisites

- Docker installed on your system
- Docker Compose (optional, for easier management)

### Quick Start with Docker Compose

1. **Build and run the application:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

3. **Stop the application:**
   ```bash
   docker-compose down
   ```

### Manual Docker Build

If you prefer to use Docker directly:

1. **Build the Docker image:**
   ```bash
   docker build -t meowtivator .
   ```

2. **Run the container:**
   ```bash
   docker run -p 3000:80 meowtivator
   ```

3. **Access the application:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables in Docker

For production deployments, you can pass environment variables to the container:

```bash
docker run -p 3000:80 \
  -e REACT_APP_FIREBASE_API_KEY=your_api_key \
  -e REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain \
  meowtivator
```

**Note:** Environment variables must be prefixed with `REACT_APP_` to be accessible in the React application.

### Development with Docker

For development with hot reloading:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

This will start the development server with live reloading when you make changes to the source code.

## Getting Started

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
