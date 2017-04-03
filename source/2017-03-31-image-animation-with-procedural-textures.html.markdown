---
title: Image Animation With Procedural Textures
date: 2017-03-31 01:13 UTC
tags:
---

## What we are building

<div id="full-effect"></div>

In 1630, Dutch painter named Matthias Storm created a beautiful [painting](https://commons.wikimedia.org/wiki/Category:Matthias_Stom#/media/File:A_Young_Man_Reading_by_Candlelight_(Matthias_Stom)_-_Nationalmuseum_-_23887.tif) of a young man reading by candlelight. Little did he know that in 2017, his painting would be brought to life with the help of procedural textures and WebGL.

After watching this [Blizzard tech talk](http://www.gdcvault.com/play/1017660/Technical-Artist-Bootcamp-The-VFX), I started to see the potential for procedural noise to create cool effects. The technique is simple: multiply two textures together, and then multiply the product by `2.0`. This technique is how Blizzard built all their spell effects in the game _Diablo II_. Turns out that it's a common game technique.

<img src="images/diablo-vfx.jpg" />

## Applying game programming techniques to the web

When I saw this tech talk, first I started wishing I was a game programmer. Then I started wondering, could I use this same technique on the web? Adding in some fiery, smokey, or magical effects could be a great way to spice up static images and make them into a compelling experience.

## Breakdown

Here are some of the layers in the effect built up step-by-step:

<div id="effect-breakdown"></div>

- I took 2 layers of turbulent [Perlin noise](https://en.wikipedia.org/wiki/Perlin_noise), multiplied them together and then by `2.0`
- I scrolled both layers of noise upwards at different speeds
- I multipled this noise by a mask that I made in Photoshop for the flame, to make sure the flame only showed where I wanted it
- I used the mask noise to ramp between yellow and orange for the flame
- I used the [screen blend mode](https://en.wikipedia.org/wiki/Blend_modes#Screen) to put the flame over the image
- I used 2 more layers of noise and another mask for the rest of the lighting in the scene. The noise was lower frequency and non-turbulent to be more subtle.
- I pulsed the whole effect by mixing with the original image using offset sine waves