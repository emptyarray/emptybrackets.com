import React from 'react';
import ReactDOM from 'react-dom';
import raf from 'raf';
import Measure from 'react-measure';
import glsl from 'glslify';

const GL = require("gl-react");
const {Surface} = require("gl-react-dom");

const shaders = GL.Shaders.create({
  noise: {
    frag: glsl`
precision mediump float;

#pragma glslify: snoise3 = require(glsl-noise/simplex/3d) 

varying vec2 uv;

uniform float tick;
uniform sampler2D image;
uniform sampler2D flameMask;
uniform sampler2D lightingMask;
uniform float onlyFlame;
uniform float flameNoise1;
uniform float flameNoise2;
uniform float flameMaskFactor;


float screen(float a, float b) {
  return 1.0 - (1.0 - a) * (1.0 - b);
}

vec3 screen3(vec3 a, vec3 b) {
  return vec3(screen(a.r, b.r), screen(a.g, b.g), screen(a.b, b.b));
}

vec3 result(vec3 c, float c_factor, float onlyFlame, vec4 flame, vec3 lighting) {
  
  vec3 lit = mix(c, lighting, c_factor) * (1.0 - onlyFlame);
  return mix(lit, screen3(lit, flame.rgb), c_factor * flame.a);
}

float turbulence(float x) {
  return 1.0 - abs(x);
}

vec4 flame(float n1, float n1_factor, float n2, float n2_factor, float mask, float mask_factor) {
  vec3 yellow = vec3(237.0/255.0, 205.0/255.0, 137.0/255.0);
  vec3 orange = vec3(209.0/255.0, 145.0/255.0, 64.0/255.0);

  float noise = mix(1.0, n1, n1_factor) * mix(1.0, n2, n2_factor) * (n1_factor + n2_factor);
  float masked_noise = mix(noise, noise * mask, mask_factor);

  return vec4(mix(orange, yellow, masked_noise), masked_noise);
}

vec3 lighting(vec3 c, float n1, float n1_factor, float n2, float n2_factor, float mask) {
  float noise = mix(1.0, n1, n1_factor) * mix(1.0, n2, n2_factor) * (n1_factor + n2_factor);
  float masked_noise = noise * mask;
  vec3 noised_image = vec3(screen(c.r, c.r * masked_noise), screen(c.g, c.g * masked_noise), screen(c.b, c.b * masked_noise));
  return noised_image;
}

void main () {
  vec4 c = texture2D(image, uv);
  float fm = texture2D(flameMask, uv).r;
  float m = texture2D(lightingMask, uv).r;

  float n1 = snoise3(vec3(uv.x * 4.0, uv.y * 4.0 - tick * 0.35, 1.0)) / 2.0 + 0.5;
  float n2 = snoise3(vec3(uv.x * 8.4, uv.y * 8.4 - tick * 0.56, 1.0)) / 2.0 + 0.5;
  float n3 = snoise3(vec3(uv.x * 27.0, uv.y * 27.0 - tick * 6.54, 1.0));
  float n4 = snoise3(vec3(uv.x * 21.0, uv.y * 21.0 - tick * 4.1, 1.0)) / 2.0 + 0.5;
  n3 = turbulence(n3);
  n4 = turbulence(n4);

  vec4 f = flame(n3, flameNoise1, n4, flameNoise2, fm, flameMaskFactor);
  vec3 l = lighting(c.rgb, n1, 1.0, n1, 1.0, m);

  float pulse = 0.7 + sin(tick) * 0.1 + sin(tick * 7.0) * 0.1 + sin(tick * 5.0) * 0.1;
  pulse = mix(pulse, 1.0, onlyFlame);

  vec3 r = result(c.rgb, pulse, onlyFlame, f, l);

  gl_FragColor = vec4(r, 1.0);
}
    `
  }
});

const Noise = GL.createComponent(
  ({ tick, image, flameMask, lightingMask, onlyFlame, flameNoise1, flameNoise2, flameMaskFactor }) => <GL.Node
    shader={shaders.noise}
    uniforms={{ tick, image, flameMask, lightingMask, onlyFlame, flameNoise1, flameNoise2, flameMaskFactor }}
  />,
  { displayName: "Noise" });

class AnimatedImage extends React.Component {

  steps = [
    { name: "1 layer of noise", onlyFlame: 1.0, flameNoise1: 1.0, flameNoise2: 0.0, flameMaskFactor: 0.0 },
    { name: "2 layers of noise", onlyFlame: 1.0, flameNoise1: 1.0, flameNoise2: 1.0, flameMaskFactor: 0.0 },
    { name: "Masked flame", onlyFlame: 1.0, flameNoise1: 1.0, flameNoise2: 1.0, flameMaskFactor: 1.0 },
    { name: "Full effect", onlyFlame: 0.0, flameNoise1: 1.0, flameNoise2: 1.0, flameMaskFactor: 1.0 },
  ];

  state = { 
    dimensions: { width: false, height: false },
    time: 0,
    step: this.props.breakdown ? 0 : this.steps.length - 1
  };

  


  fps = 1; // target frame rate
  frameDuration = 1000 / this.fps; // how long, in milliseconds, a regular frame should take to be drawn
  lastTime = 0;

  componentDidMount () {
    const loop = time => {
      var delta = time - this.lastTime;
      this.lastTime = time;

      // how much of a frame did the last frame take
      var step = delta / this.frameDuration;

      this.raf = raf(loop);
      this.setState({
        time: this.state.time + step
      });
    };
    this.raf = raf(loop);

    if(this.props.breakdown) {
      this.interval = setInterval( () => {
        this.setState({ dimensions: this.state.dimensions, time: this.state.time, step: (this.state.step + 1) % this.steps.length });
      }, 3000);
    }
    
  }

  componentWillUnmount () {
    cancelAnimationFrame(this.raf);
    this.interval && clearInterval(this.interval);
  }

  render() {
    const { width } = this.state.dimensions;
    const height = width / this.props.aspect;

    var noiseProps = this.steps[this.state.step];

    noiseProps.tick = this.state.time;
    noiseProps.image = window.location.origin + "/images/candlelight.jpg";
    noiseProps.flameMask = window.location.origin + "/images/candlelight-flame-mask.jpg";
    noiseProps.lightingMask = window.location.origin + "/images/candlelight-mask.jpg";

    return <div className="animated-image"  >

      <Measure onMeasure={(dimensions) => {
            this.setState({dimensions})
          }}
        >
          

          <div className="image-container" >
            <div className="aspect">

              <div className="overlay" style={{ width: width, height: height }}>
                {width > 0 ? <Surface width={width} height={height}>
                  <Noise {...noiseProps} />

                </Surface> : ''}

                {this.props.breakdown ? <span className="breakdown-step-name">{noiseProps.name}</span> : ''}
              </div>
            </div>
          </div>

      </Measure>

    </div>;
  }
}


ReactDOM.render(<AnimatedImage aspect={480/382} />, document.getElementById('full-effect'));
ReactDOM.render(<AnimatedImage aspect={480/382} breakdown={true} />, document.getElementById('effect-breakdown'));
