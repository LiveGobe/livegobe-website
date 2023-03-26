import { RequestHandler } from "express"

declare global {
    namespace Express {
        interface Response {
            /**
             * Use to send SSG page or render SSR template
             * @param {string} name Name of the view
             * @param {object} options Options to send to render function
             */
            serve(name: string, options: object): void;
        }
    }
}

export = middleware;

declare function middleware(): RequestHandler;