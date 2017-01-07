import webpack from 'webpack'
import path from 'path'
import express from 'express'

import React from 'react'
import { Provider } from 'react-redux'
import { renderToString } from 'react-dom/server'
import { RouterContext, match } from 'react-router'

import template from './template'
import config from './webpack.config'

import createRoutes from './universal/createRoutes'
import store from './universal/store'

const serverPort = process.env.PORT
const app = express()

const __PROD__ = process.env.NODE_ENV === 'production'
const __DEV__ = process.env.NODE_ENV === 'development'

if (__DEV__) {
    const compiler = webpack(config)

    // It's a simple wrapper middleware for webpack. It serves the files emitted from webpack over 
    // a connect server. https://github.com/webpack/webpack-dev-middleware
    app.use(require('webpack-dev-middleware')(compiler, {
        noInfo: false,
        publicPath: config.output.publicPath,
        stats: { colors: true }
    }))

    // Webpack hot reloading using only webpack-dev-middleware. This allows you to add hot reloading 
    // into an existing server without webpack-dev-server https://github.com/glenjamin/webpack-hot-middleware
    app.use(require('webpack-hot-middleware')(compiler))
    app.use(express.static(path.resolve(__dirname, './universal')))
} else if (__PROD__) {
    app.use(express.static(path.resolve(__dirname, 'dist')))
}

// Create a handler for all routes
app.get('*', (req, res) => {
    if (__DEV__) {
        // In development, we don't need to render server-side because React renders everything for us.
        res.status(200).send(`
            <!doctype html>
            <html>
                <header>
                    <title>My Universal App</title>
                </header>
                <body>
                    <div id='root'></div>
                    <script src='/assets/bundle.js'></script>
                </body>
            </html>
        `)
    } else if (__PROD__) {
        // https://github.com/ReactTraining/react-router/blob/master/docs/guides/ServerRendering.md
        // https://blog.tableflip.io/server-side-rendering-with-react-and-redux/

        // Server rendering is a bit different than in a client.
        // To facilitate these needs, you drop one level lower than the <Router> API with:
        // - `match` to match the routes to a location without rendering
        // - `RouterContext` for synchronous rendering of route components
        const initialState = store.getState()
        const routes = createRoutes()

        // // routes is our object of React routes defined above
        match({ routes, location: req.url }, (error, redirectLocation, renderProps) => {
            if (error) {
                // something went badly wrong, so 500 with a message
                res.status(500).send(error.message)
            } else if (redirectLocation) {
                // we matched a ReactRouter redirect, so redirect from the server
                res.redirect(302, redirectLocation.pathname + redirectLocation.search)
            } else if (renderProps) {
                // if we got props, we found a valid component to render for the given route

                // For data loading, you can use the renderProps argument to build whatever convention you 
                // want--like adding static load methods to your route components, or putting data loading 
                // functions on the routes--it's up to you.
                const rootComponent = renderToString(
                    <Provider store={store}>
                        <RouterContext { ...renderProps } />
                    </Provider>
                )
                res.status(200).send(template({ rootComponent, initialState }))
            } else {
                // no route match, so 404. In a real app you might render a custom 404 view here
                res.status(404).send('Not found')
            }
        }
        )
    }

})

app.listen(serverPort, (err) => {
    if (err) console.error(err)
    console.log(`${process.env.NODE_ENV} running at http://localhost:${serverPort}`)
})
