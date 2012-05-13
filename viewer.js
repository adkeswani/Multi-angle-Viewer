var imgs;
var path;
var basename;
var separator;
var numImgs;
var currImgIndex;
var currImg;
var currZoom;
var imgTopLeft;
var loadingImg;
var loadingAnimFrame;
var loading;
var waitingForFirstImage;
var rotateDragStarted;
var panDragStarted;
var rotateDragDistance;
var panDragDistance;
var dragStart;
var numAutoRotations;
var transition;
var prevImg;
var transitioning;

//Shim = uses JS, then browser-specific, then HTML5 once available
//Returns a function that when called will do the timeout!
window.requestAnimFrame = (function() {
    return  window.requestAnimationFrame       || 
            window.webkitRequestAnimationFrame || 
            window.mozRequestAnimationFrame    || 
            window.oRequestAnimationFrame      || 
            window.msRequestAnimationFrame     || 
            function(callback) {
                window.setTimeout(callback, 1000 / 60);
            };
})();

function initViewer(canvas, _path, _basename, _separator, _extension, numXImages, numYImages, _transition) {
    if (canvas && canvas.getContext) {
        window.cc = canvas.getContext('2d');
    } else {
        return;
    }

    path = _path;
    basename = _basename;
    separator = _separator;
    extension = _extension;

    numImgs = [numXImages, numYImages];
    currImgIndex = [0,0];

    imgs = new Array(numXImages)
    for (var i = 0; i < numXImages; i++) {
        imgs[i] = new Array(numYImages);
        for (var j = 0; j < numYImages; j++) {
            imgs[i][j] = new Image();
            imgs[i][j].hasLoaded = false;
            imgs[i][j].indices = [i, j];
        }
    }
    currImg = imgs[currImgIndex[0]][currImgIndex[1]];

    loadingImg = new Image();
    loadingImg.src = 'loading.png';

    window.cc.canvas.onmousedown = startDrag;
    window.cc.canvas.onmousemove = doDrag;
    window.cc.canvas.onmouseup = stopDrag;
    window.cc.canvas.onmouseout = stopDrag;

    //Courtesy of http://www.experts-exchange.com/Programming/Languages/Scripting/JavaScript/A_2281-Mouse-Wheel-Programming-in-JavaScript.html
    if (window.cc.canvas.addEventListener) {
        window.cc.canvas.addEventListener('DOMMouseScroll', mouseZoom, false);
        window.cc.canvas.addEventListener('mousewheel', mouseZoom, false);
    }
    else {
        window.cc.canvas.onmousewheel = mouseZoom;
    }

    numAutoRotations = 0;

    transition = _transition;

    imgTopLeft = [0, 0];
    preloadImgs();
    waitingForFirstImage = true;
    drawCurrImg(false);
}

function mouseZoom(e) {
    var nDelta = 0;

    //Courtesy of http://www.experts-exchange.com/Programming/Languages/Scripting/JavaScript/A_2281-Mouse-Wheel-Programming-in-JavaScript.html
    if (e.wheelDelta) {
        nDelta = e.wheelDelta;
        if (window.opera) {
            nDelta = -nDelta;
        }
    } else if (e.detail) {
        nDelta = -e.detail;
    }
    
    //Maybe want to try doing this about the current location of the mouse?
    if (nDelta > 0) {
        zoom(1.2);
    } else {
        zoom(0.8);
    }
}

function startDrag(e) {
    //Might need something else for IE8, different button indexes
    if (e.button == 0) {
        rotateDragStarted = true;
        panDragStarted = false;
    } else if (e.button == 1) {
        panDragStarted = true;
        rotateDragStarted = false;
    }

    dragStart = [e.screenX, e.screenY]
}

function doDrag(e) {
    var transform;

    if (rotateDragStarted) {
        if (e.screenX - dragStart[0] >= 100) {
            rotate(1, 0);
            dragStart[0] = e.screenX;
        } else if (e.screenX - dragStart[0] <= -100) {
            rotate(-1, 0);
            dragStart[0] = e.screenX;
        }
        
        if (e.screenY - dragStart[1] >= 100) {
            rotate(0, -1);
            dragStart[1] = e.screenY;
        } else if (e.screenY - dragStart[1] <= -100) {
            rotate(0, 1);
            dragStart[1] = e.screenY;
        }
    } else if (panDragStarted) {
        if (e.screenX - dragStart[0] >= 10) {
            pan(10, 0);
            dragStart[0] = e.screenX;
        } else if (e.screenX - dragStart[0] <= -10) {
            pan(-10, 0);
            dragStart[0] = e.screenX;
        }
        
        if (e.screenY - dragStart[1] >= 10) {
            pan(0, 10);
            dragStart[1] = e.screenY;
        } else if (e.screenY - dragStart[1] <= -10) {
            pan(0, -10);
            dragStart[1] = e.screenY;
        }
    }
}

function stopDrag(e) {
    rotateDragStarted = false;
    panDragStarted = false;
}

function initCanvas() {
    //Fit image inside canvas to begin, leaves (0,0) at top-left
    currZoom = 1.0;
    var fitWidthScale = window.cc.canvas.clientWidth / imgs[0][0].naturalWidth;
    var fitHeightScale = window.cc.canvas.clientHeight / imgs[0][0].naturalHeight;
    if (fitWidthScale < fitHeightScale) {
        currZoom = fitWidthScale;
    } else {
        currZoom = fitHeightScale;
    }
    window.cc.scale(currZoom, currZoom);

    //Move (0,0) to centre of canvas
    window.cc.translate(window.cc.canvas.clientWidth / currZoom / 2, window.cc.canvas.clientHeight / currZoom / 2);

    //Find where top-left of image should be positioned
    //This will always centre the image about (0,0)
    imgTopLeft = [-imgs[0][0].naturalWidth / 2, -imgs[0][0].naturalHeight / 2];
}

function resetTransforms() {
    window.cc.setTransform(1, 0, 0, 1, 0, 0);
    initCanvas();
    drawCurrImg(false);
}

function imgLoad(e) {
    var target = e.currentTarget || e.srcElement;
    target.hasLoaded = true;
    loading = false;
    //if target is current image, draw it up
    if ((target.indices[0] == currImgIndex[0]) && (target.indices[1] == currImgIndex[1])) {
        if (waitingForFirstImage) {
            waitingForFirstImage = false;
            initCanvas();
        }
        drawCurrImg(false);
    }
}

function autoRotate() {
    if (currImg.hasLoaded) {
        window.setTimeout(doAutoRotate, 3000);
    } else {
        window.setTimeout(autoRotate, 100); //Not sure if this is working :/, can't tell
    }
}

function doAutoRotate() {
    if (numAutoRotations == numImgs[0]) {
        rotate(0, -1);
        numAutoRotations = 0;
    } else {
        rotate(1, 0)
        numAutoRotations = numAutoRotations + 1;
    }
    autoRotate();
}

function preloadImgs() {
    var loadingImgs = [
        [currImgIndex[0], currImgIndex[1]],
        [mod(currImgIndex[0] - 1, numImgs[0]), currImgIndex[1]],
        [mod(currImgIndex[0] + 1, numImgs[0]), currImgIndex[1]],
        [currImgIndex[0], mod(currImgIndex[1] - 1, numImgs[1])],
        [currImgIndex[0], mod(currImgIndex[1] + 1, numImgs[1])],
    ]
        
    for (var i = 0; i < loadingImgs.length; i++) {
        var currLoadingImg = imgs[loadingImgs[i][0]][loadingImgs[i][1]];
        if (!currLoadingImg.src) {
            currLoadingImg.onload = imgLoad;
            currLoadingImg.src = path + basename + separator + loadingImgs[i][0] + separator + loadingImgs[i][1] + '.' + extension;
        }
    }
}

function mod(a, b) {
    var result = a % b;
    if (result < 0) {
        result = result + b
    }
    return result;
}

function drawCurrImg(withTransition, xTransitionDirection, yTransitionDirection) {
    loading = false;
    if (currImg.hasLoaded) {
        if (withTransition) {
            transition(xTransitionDirection, yTransitionDirection);
        } else {
            noTransition(xTransitionDirection, yTransitionDirection);
        }
    } else {
        loading = true;
        loadingAnimFrame = 0;
        loadingAnimation();
    }
}

function loadingAnimation() {
    if (!loading) {
        return
    }

    window.setTimeout(loadingAnimation, 1000 / 8);
    loadingAnimFrame = mod(loadingAnimFrame + 1, 8);

    window.cc.save();
        window.cc.setTransform(1, 0, 0, 1, 0, 0);
        window.cc.drawImage(loadingImg, 31 * loadingAnimFrame, 0, 31, 31, 0, 0, 31, 31);
    window.cc.restore();
}

function rotate(numXRotations, numYRotations) {
    currImgIndex = [mod(currImgIndex[0] - numXRotations, numImgs[0]), mod(currImgIndex[1] - numYRotations, numImgs[1])];
    prevImg = currImg;
    currImg = imgs[currImgIndex[0]][currImgIndex[1]];
    preloadImgs();
    drawCurrImg(true, numXRotations, numYRotations);
}

function pan(xDistance, yDistance) {
    imgTopLeft = [imgTopLeft[0] + xDistance / currZoom, imgTopLeft[1] + yDistance / currZoom];
    drawCurrImg(false);
}

function zoom(amount) {
    window.cc.clearRect(imgTopLeft[0], imgTopLeft[1], currImg.naturalWidth, currImg.naturalHeight);
    window.cc.scale(amount,amount);
    currZoom = currZoom * amount;
    drawCurrImg(false);
}

function noTransition(xTransitionDirection, yTransitionDirection) {
    window.cc.save();
        window.cc.setTransform(1, 0, 0, 1, 0, 0);
        window.cc.clearRect(0, 0, window.cc.canvas.clientWidth, window.cc.canvas.clientHeight);
    window.cc.restore();
    window.cc.drawImage(currImg, imgTopLeft[0], imgTopLeft[1]);
}

var prevOpacity;
var currOpacity;

function fadeTransition(xTransitionDirection, yTransitionDirection) {
    prevOpacity = 1.0;
    currOpacity = 0.0;
    requestAnimFrame(doFadeTransition);
}

function doFadeTransition() {
    //opacities are opposites of each other, e.g. 0.4 and 0.6, can just use one var
    window.cc.save();
        window.cc.setTransform(1, 0, 0, 1, 0, 0);
        window.cc.clearRect(0, 0, window.cc.canvas.clientWidth, window.cc.canvas.clientHeight);
    window.cc.restore();

    if (prevImg) {
        window.cc.globalAlpha = prevOpacity;
        window.cc.drawImage(prevImg, imgTopLeft[0], imgTopLeft[1]);
        prevOpacity = prevOpacity - 0.1;
    }

    window.cc.globalAlpha = currOpacity;
    window.cc.drawImage(currImg, imgTopLeft[0], imgTopLeft[1]);
    currOpacity = currOpacity + 0.1;

    window.cc.globalAlpha = 1.0;

    if (currOpacity <= 1.0) {
        requestAnimFrame(doFadeTransition);
    }
}

var prevScale;
var currScale;
var xDirection;
var yDirection;

function directionalFadeTransition(xTransitionDirection, yTransitionDirection) {
    prevOpacity = 1.0;
    currOpacity = 0.0;
    prevScale = 1.0;
    currScale = 0.0;
    xDirection = xTransitionDirection;
    yDirection = yTransitionDirection;
    requestAnimFrame(doDirectionalFadeTransition);

}

function doDirectionalFadeTransition() {
    window.cc.save();
        window.cc.setTransform(1, 0, 0, 1, 0, 0);
        window.cc.clearRect(0, 0, window.cc.canvas.clientWidth, window.cc.canvas.clientHeight);
    window.cc.restore();

    if (prevImg) {
        var prevOrigin = [imgTopLeft[0], imgTopLeft[1]];
        //Right and up are +ve
        if (xDirection > 0) {
            prevOrigin[0] = prevOrigin[0] + (1 - prevScale) * prevImg.naturalWidth;
        } else if (yDirection < 0) {
            prevOrigin[1] = prevOrigin[1] + (1 - prevScale) * prevImg.naturalHeight;
        }
        window.cc.globalAlpha = prevOpacity;
            if (xDirection != 0) {
                window.cc.drawImage(prevImg, 0, 0, prevImg.naturalWidth, prevImg.naturalHeight, prevOrigin[0], prevOrigin[1], prevScale * prevImg.naturalWidth, currImg.naturalHeight);
            } else if (yDirection != 0) {
                window.cc.drawImage(prevImg, 0, 0, prevImg.naturalWidth, prevImg.naturalHeight, prevOrigin[0], prevOrigin[1], currImg.naturalWidth, prevScale * prevImg.naturalHeight);
            }
            prevScale = prevScale - 0.1;

            prevOpacity = prevOpacity - 0.1;
        window.cc.globalAlpha = 1.0;
    }

    var currOrigin = [imgTopLeft[0], imgTopLeft[1]];
    if (xDirection < 0) {
        currOrigin[0] = currOrigin[0] + (1 - currScale) * prevImg.naturalWidth;
    } else if (yDirection > 0) {
        currOrigin[1] = currOrigin[1] + (1 - currScale) * prevImg.naturalHeight;
    }

    window.cc.globalAlpha = currOpacity;
        if (xDirection != 0) {
            window.cc.drawImage(currImg, 0, 0, currImg.naturalWidth, currImg.naturalHeight, currOrigin[0], currOrigin[1], currScale * currImg.naturalWidth, currImg.naturalHeight);
        } else if (yDirection != 0) {
            window.cc.drawImage(currImg, 0, 0, currImg.naturalWidth, currImg.naturalHeight, currOrigin[0], currOrigin[1], currImg.naturalWidth, currScale * currImg.naturalHeight);
        }
        currOpacity = currOpacity + 0.1;
        currScale = currScale + 0.1;
    window.cc.globalAlpha = 1.0;

    if (currOpacity <= 1.0) {
        requestAnimFrame(doDirectionalFadeTransition);
    }
}
