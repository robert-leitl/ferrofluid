#version 300 es

precision highp float;

uniform sampler2D u_envMapTexture;
uniform vec3 u_cameraPosition;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;

#define PI 3.1415926535

float powFast(float a, float b) {
  return a / ((1. - b) * a + b);
}

void main() {
    vec3 V = normalize(u_cameraPosition - v_position);
    vec3 N = normalize(v_normal);
    vec3 L = normalize(vec3(2., 1., 1.));
    vec3 R = reflect(L, N);
    float NdV = dot(N, V);
    float dif = dot(L, N);
    float specular = powFast(max(0.0, dot(R, -V)), 200.);

    // ambient ligthing
    float phi   = atan(R.z, R.x);
	float theta = acos(R.y);
    vec2 equiPos = vec2(-phi / (2. * PI), theta / PI);
    vec3 ambient = texture(u_envMapTexture, equiPos).rgb;

    // fresnel
    float ft = dot(N, normalize(vec3(0., 0., 1.)));
    float fresnel = smoothstep(0.6, 1., min(1., pow(1. - ft, 2.)));
    vec3 fc = (fresnel) * vec3(.1, 1., .9);

    // fade out the borders
    vec2 c = v_texcoord * 2. - 1.;
    float edgeMask = 1. - smoothstep(0.1, 1., dot(c, c));

    // iridescence


    vec3 color = ambient * 0.2 + fresnel * 0.2 + specular * 1.;

    outColor = vec4(color, 1.);
}