precision mediump float;

/**
-------------- bloom vertex shader -------------

    author: Richman Stewart

    simple vertex shader that sets the position
    to the specified matrix and position while
    passing the vertex colour and tex coords
    to the fragment shader

**/

attribute vec2 a_position;
varying vec2 v_texCoord;
uniform mat4 u_matrix;

void main() {
    v_texCoord = a_position;
    gl_Position = u_matrix * vec4(a_position, 0, 1);
}