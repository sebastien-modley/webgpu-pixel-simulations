import rawPlugin from "vite-raw-plugin";

export default {
    plugins: [
        rawPlugin({
            fileRegex: /\.wgsl$/,
        }),
    ],
    test: {
        browser: {
            enabled: true,
            name: "chrome", // browser name is required
        },
    },
};
