export const mapRange = (value, min1, max1, min2, max2) => {
    return min2 + (max2 - min2) * (value - min1) / (max1 - min1);
}

export const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

export const easeInOutExpo = (x) => {
    return x === 0
    ? 0
    : x === 1
    ? 1
    : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2
    : (2 - Math.pow(2, -20 * x + 10)) / 2;
}

export const easeInOutCubic = (x) => {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export const easeInExpo = (x) => {
    return x === 0 ? 0 : Math.pow(2, 10 * x - 10);
}

export const easeOutQuint = (x) => {
    return 1 - Math.pow(1 - x, 5);
}