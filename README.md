# Web App README
This is a web application built with Node.js and Express.js. It uses MongoDB as its database and Passport.js for authentication, React for Server Side Rendering and Static Site Generation, SASS for styling.

## Features
- User authentication and authorization
- File storage and management
- Password generator
- Localization support for English and Russian

## Installation
- Clone the repository
- Install dependencies with `npm install`
- Create a **config.js** (see **config-example.js** for reference)
- Build JS and CSS bundles using `npm run build:dev` for development and `npm run build:prod` for production (Additionally you can use `npm run watch` to make Webpack watch for changes in source files)
- Create a user by running `./misc/createUser.js` script (You'll need a working instance of **MongoDB**)
- Start the server with `npm test` (For production use **pm2**)

## Usage
Once the server is running, you can access the app by navigating to **http://localhost:8080** in your web browser. The default port can be changed in the **config.js** file.