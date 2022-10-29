#version 300 es

precision highp float;

uniform sampler2D u_heightMapTexture;

out vec4 outColor;

in vec2 v_uv;

void main() {
    outColor = vec4(texture(u_heightMapTexture, v_uv).r);
}