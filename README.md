# Web App README
This is a web application built with Node.js and Express.js. It uses MongoDB as its database and Passport.js for authentication, React for Server Side Rendering and Static Site Generation, SASS for styling.

## Features
- User authentication and authorization
- File storage and management
- Password generator
- Localization support for English and Russian
![1](https://github.com/LiveGobe/livegobe-website/assets/62285149/f02c6a3f-ad20-4bc9-a2eb-7e8e6022c96a)
![2](https://github.com/LiveGobe/livegobe-website/assets/62285149/578c2492-7c5b-4f04-8cad-fa4822546f20)
![3](https://github.com/LiveGobe/livegobe-website/assets/62285149/f8540693-c75b-4777-9b08-fcf98f9465f6)
![4](https://github.com/LiveGobe/livegobe-website/assets/62285149/c1da0747-f979-41bf-aa57-e2592a6964ac)

## Development Installation
- Fork the repository
- Install dependencies with `npm install`
- Create a **config.js** (see **config-example.js** for reference)
- Build JS and CSS bundles using `npm run build:dev` for development (Additionally you can use `npm run watch` to watch for changes in source files)
- Create a user by running `./misc/createUser.js` script (You'll need a working instance of **MongoDB**)
- Start the server with `npm test`

## Usage
Once the server is running, you can access the app by navigating to **http://localhost:8080** in your web browser. The default port can be changed in the **config.js** file.
