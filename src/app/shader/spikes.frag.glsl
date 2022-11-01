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

    outColor = vec4(color, 1.);
}