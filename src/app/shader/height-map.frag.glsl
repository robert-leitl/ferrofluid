#version 300 es

precision highp float;
precision highp int;
precision highp usampler2D;

uniform float u_zoom;
uniform sampler2D u_particlePosTexture;

in vec2 v_uv;

out vec4 outHeight;

#include ./utils/particle-utils.glsl;

// https://iquilezles.org/articles/functions/
float almostIdentity( float x, float m, float n )
{
    if( x>m ) return x;
    float a = 2.0*n - m;
    float b = 2.0*m - 3.0*n;
    float t = x/m;
    return (a*t + b)*t*t + n;
}

void main() {
    ivec2 particleTexSize = textureSize(u_particlePosTexture, 0);
    int particleCount = particleTexSize.x * particleTexSize.y;

    vec2 pos = v_uv * 2. - 1.;
    float w = .05; // smoothing factor (the higher, the smoother)
    float res = 1.; // result height value

    // smooth voronoi (https://www.shadertoy.com/view/ldB3zc)
    for(int i=0; i<particleCount; i++) {
        vec4 pj = texelFetch(u_particlePosTexture, ndx2tex(particleTexSize, i), 0) * u_zoom;
        float d = distance(pj.xy, pos);

        // do the smooth min 
        float h = smoothstep( -1., 1., (res - d) / w );
        res = mix(res, d, h) - h * (1.0 - h) * (w / (1.0 + 3.0 * w));
    }

    // gain according to particle density
    float defaultZoom = 1.9;
    float zoomGain = 1. + (defaultZoom - u_zoom) * 2.;
    float gain = 9. * zoomGain;
    res = clamp(res * gain, 0., 1.);

    // smooth out the spike peaks
    res = almostIdentity(res, 0.1, 0.04);
    
    res = (1. - res);
    res *= 0.28; // max height

    outHeight = vec4(res);
}