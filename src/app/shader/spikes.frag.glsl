#version 300 es

precision highp float;

uniform sampler2D u_envMapTexture;
uniform vec3 u_cameraPosition;
uniform float u_zoom;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;

#define PI 3.1415926535

float powFast(float a, float b) {
  return a / ((1. - b) * a + b);
}

vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
    return a + b*cos( 6.28318*(c*t+d) );
}

void main() {
    vec3 V = normalize(u_cameraPosition - v_position);
    vec3 N = normalize(v_normal);
    vec3 L = normalize(vec3(2., 1., 1.));
    vec3 R = reflect(L, N);

    // specular lighting
    float specularValue = powFast(max(0.0, dot(R, -V)), 50.);
    vec3 specular = specularValue * vec3(1., 0.4, 1.);

    // ambient ligthing
    float phi   = atan(R.z, R.x);
	  float theta = acos(R.y);
    vec2 equiPos = vec2(-phi / (2. * PI), theta / PI);
    vec3 ambient = texture(u_envMapTexture, equiPos).rgb;

    // fresnel
    float ft = dot(N, normalize(vec3(0., 0., 1.)));
    float fresnelValue = smoothstep(0.6, 1., min(1., pow(1. - ft, 2.)));
    fresnelValue *= smoothstep(0.5, 1., 1. - v_position.z) * 0.6 + 0.4;
    vec3 fresnel = fresnelValue * vec3(0.9, 1., 1.);

    // fade out the borders
    vec2 center = v_texcoord * 2. - 1.;
    float edgeMask = 1. - smoothstep(0., .8, dot(center, center)) * 1.;

    // iridescence
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.00, 0.33, 0.67);
    vec3 iridescence = palette(ft * 3., a, b, c, d) * (1. - ft);
    iridescence *= edgeMask * 0.05 * (2. - u_zoom * 2.);

    vec3 color = ambient * 0.2 + fresnel * 0.2 + specularValue * 1.2 + iridescence;

    outColor = vec4(color, 1.);
}