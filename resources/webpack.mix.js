let mix = require("laravel-mix");
mix.setPublicPath("../src/web");
mix.js("src/geoman.js", "js");
mix.postCss("src/geoman.css", "css")
