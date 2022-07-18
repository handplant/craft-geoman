<?php
/**
 * SimpleMap for Craft CMS
 *
 * @link      https://ethercreative.co.uk
 * @copyright Copyright (c) 2019 Ether Creative
 */

namespace handplant\craftgeoman\web;

use craft\web\AssetBundle;
use craft\web\assets\cp\CpAsset;

/**
 * Class MapAsset
 *
 * @author  Ether Creative
 * @package ether\simplemap\web\assets
 */
class GeomanAsset extends AssetBundle
{

	public function init ()
	{
		$this->sourcePath = __DIR__;

		$this->depends = [
			CpAsset::class
		];



		if (getenv('ETHER_ENVIRONMENT'))
		{
			$this->js = [
				'https://localhost:8080/app.js',
			];
		}
		else
		{
			$this->css = [
				'css/geoman.css'
			];

			$this->js = [
				'js/geoman.js'
			];
		}

		parent::init();
	}

}