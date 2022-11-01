#version 300 es

precision highp float;

uniform sampler2D u_envMapTexture;
uniform vec3 u_cameraPosition;
uniform float u_zoom;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;

#include ./fluid-shading.glsl;

void main() {
    vec3 V = normalize(u_cameraPosition - v_position);
    vec3 N = normalize(v_normal);
    vec3 color = fluidShading(V, N, v_position, u_zoom, u_envMapTexture);

    // fade out the borders
    vec2 c = v_position.xz;  
    float edgeMask = 1. - smoothstep(0.6, 1., dot(c,c)) * 1.;
 
    outColor = vec4(mix(vec3(0.05), color, edgeMask), 1.);
}