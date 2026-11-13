<?php

namespace handplant\craftgeoman\web;

use craft\web\AssetBundle;
use craft\web\assets\cp\CpAsset;

class GeomanAsset extends AssetBundle
{
    public function init(): void
    {
        $this->sourcePath = __DIR__ . '/dist';
        $this->depends = [CpAsset::class];
        $this->js = ['geoman.js'];
        $this->css = ['geoman.css'];
        parent::init();
    }
}
