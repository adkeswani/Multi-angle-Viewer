var multiAngleViewer = (function() {

var imgs;
var path;
var basename;
var separator;

var numImgs;
var currImgIndex;
var currImg;
var prevImg;
var imgTopLeft;

var currZoom;
var canvasUninitialised;
var transition;

var rotateDragStarted;
var panDragStarted;
var dragStart;

var loadingTimer;
var autoRotationTimer;
var transitionTimerOrId;

var userRotateEnabled;
var userPanEnabled;
var userZoomEnabled;

var LOADING_ANIM_IMG = new Image();
LOADING_ANIM_IMG.src = 'loading.png';
var LOADING_ANIM_FRAME_WIDTH = 31;
var LOADING_ANIM_FRAME_HEIGHT = 31;
var LOADING_ANIM_NUM_FRAMES = 8;

var ZOOM_IN_STEP = 1.2;
var ZOOM_OUT_STEP = 0.8;
var PAN_STEP = 10;

var ROTATE_DRAG_DISTANCE = 100;
var PAN_DRAG_DISTANCE = 10;

var ROTATE_BUTTONS_CLASS = 'rotate-button';
var PAN_BUTTONS_CLASS = 'pan-button';
var ZOOM_BUTTONS_CLASS = 'zoom-button';

var AUTO_ROTATE_INTERVAL = 3000;

var CLEAR_EXTRA_DISTANCE = 10;

/*
INITIALISATION
*/

//Initialises the viewer, must be called before viewer can be used
function initViewer(canvas, _path, _basename, _separator, _extension, numXImages, numYImages, _transition) {
    //Check if canvas is given and valid
    if (canvas && canvas.getContext) {
        window.cc = canvas.getContext('2d');
    } else {
        return;
    }

    //Load images
    path = _path;
    basename = _basename;
    separator = _separator;
    extension = _extension;

    numImgs = [numXImages, numYImages];
    currImgIndex = [0, 0];

    imgs = new Array(numXImages);
    for (var i = 0; i < numXImages; i++) {
        imgs[i] = new Array(numYImages);
        for (var j = 0; j < numYImages; j++) {
            imgs[i][j] = new Image();
            imgs[i][j].hasLoaded = false;
            imgs[i][j].indices = [i, j];
        }
    }
    currImg = imgs[currImgIndex[0]][currImgIndex[1]];

    //Set up mouse events
    window.cc.canvas.onmousedown = startDrag;
    window.cc.canvas.onmousemove = doDrag;
    window.cc.canvas.onmouseup = stopDrag;
    window.cc.canvas.onmouseout = stopDrag;

    //This block from http://www.experts-exchange.com/Programming/Languages/Scripting/JavaScript/A_2281-Mouse-Wheel-Programming-in-JavaScript.html
    if (window.cc.canvas.addEventListener) {
        window.cc.canvas.addEventListener('DOMMouseScroll', mouseZoom, false);
        window.cc.canvas.addEventListener('mousewheel', mouseZoom, false);
    }
    else {
        window.cc.canvas.onmousewheel = mouseZoom;
    }

    transition = _transition;

    //Display first image
    imgTopLeft = [0, 0];
    preloadImgs();
    canvasUninitialised = true;
    drawCurrImg(0, 0);
}

//Initialises the canvas, called only after the first image has loaded and for resetting pan and zoom
function initCanvas() {
    //Choose zoom level to fit image inside canvas
    currZoom = 1.0;
    var fitWidthScale = window.cc.canvas.clientWidth / imgs[0][0].naturalWidth;
    var fitHeightScale = window.cc.canvas.clientHeight / imgs[0][0].naturalHeight;
    if (fitWidthScale < fitHeightScale) {
        currZoom = fitWidthScale;
    } else {
        currZoom = fitHeightScale;
    }
    window.cc.scale(currZoom, currZoom);

    //Move (0,0) from top-left of canvas to centre
    window.cc.translate(window.cc.canvas.clientWidth / currZoom / 2, window.cc.canvas.clientHeight / currZoom / 2);

    //Find where top-left of image should be positioned
    imgTopLeft = [-imgs[0][0].naturalWidth / 2, -imgs[0][0].naturalHeight / 2];

    userRotateEnabled = true;
    userPanEnabled = true;
    userZoomEnabled = true;
}



/*
DRAWING AND LOADING IMAGES
*/

//Draws the current image with or without a transition or starts loading animation if it has not loaded
//Passing in 0, 0 will prevent a transition from occurring
function drawCurrImg(xTransitionDirection, yTransitionDirection) {
    window.clearTimeout(loadingTimer);

    //Re-enable zoom and pan for new current image
    enableButtons(ZOOM_BUTTONS_CLASS);
    enableButtons(PAN_BUTTONS_CLASS);
    userZoomEnabled = true;
    userPanEnabled = true;

    if (currImg.hasLoaded) {
        //Cancel existing transition
        if (window.cancelAnimationFrame) {
            window.cancelAnimationFrame(transitionTimerOrId);
        } else {
            window.clearTimeout(transitionTimerOrId);
        }
        
        if (xTransitionDirection != 0 || yTransitionDirection != 0) {
            transition(prevImg, currImg, xTransitionDirection, yTransitionDirection);
        } else if (currImg.hasOwnProperty('transitionDirection')) {
            //See else branch
            transition(prevImg, currImg, currImg.transitionDirection[0], currImg.transitionDirection[1]);
            delete currImg.transitionDirection;
        } else {
            noTransition(prevImg, currImg);
        }
    } else {
        if (prevImg && prevImg.hasLoaded) {
            //Ensure the previous image is fully drawn
            noTransition(prevImg, prevImg);

            //Store transition direction so it can be done once image is loaded
            currImg.transitionDirection = [xTransitionDirection, yTransitionDirection];
        } else {
            delete currImg.transitionDirection;
        }

        //Prevent user from zooming or panning while image is loading
        disableButtons(ZOOM_BUTTONS_CLASS);
        disableButtons(PAN_BUTTONS_CLASS);
        userZoomEnabled = false;
        userPanEnabled = false;

        loadingAnimation(0);
    }
}

//Loads the current image and the 4 adjacent to it
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

//Called whenever an image finishes loading
function imgLoad(e) {
    //Mark that image is now loaded
    var target = e.currentTarget || e.srcElement;
    target.hasLoaded = true;

    //If target is current image, draw it to the canvas
    if (target.indices[0] == currImgIndex[0] && target.indices[1] == currImgIndex[1]) {
        stopLoadingAnimation();

        if (canvasUninitialised) {
            initCanvas();
            canvasUninitialised = false;
        }
        drawCurrImg(0, 0);
    }
}

function stopLoadingAnimation() {
    window.clearTimeout(loadingTimer);

    window.cc.save();
        window.cc.setTransform(1, 0, 0, 1, 0, 0);
        window.cc.clearRect(0, 0, LOADING_ANIM_FRAME_WIDTH, LOADING_ANIM_FRAME_HEIGHT);
    window.cc.restore();
}

function loadingAnimation(frame) {
    window.cc.save();
        window.cc.setTransform(1, 0, 0, 1, 0, 0);
        window.cc.drawImage(LOADING_ANIM_IMG, LOADING_ANIM_FRAME_WIDTH * frame, 0, LOADING_ANIM_FRAME_WIDTH, LOADING_ANIM_FRAME_HEIGHT, 0, 0, LOADING_ANIM_FRAME_WIDTH, LOADING_ANIM_FRAME_HEIGHT);
    window.cc.restore();

    loadingTimer = window.setTimeout(function() { loadingAnimation(mod(frame + 1, LOADING_ANIM_NUM_FRAMES)) }, 1000 / LOADING_ANIM_NUM_FRAMES);
}

function clearImg() {
    window.cc.clearRect(imgTopLeft[0] - CLEAR_EXTRA_DISTANCE, imgTopLeft[1] - CLEAR_EXTRA_DISTANCE, currImg.naturalWidth / currZoom + CLEAR_EXTRA_DISTANCE, currImg.naturalHeight / currZoom + CLEAR_EXTRA_DISTANCE);
}



/*
TRANSFORMATIONS
*/

function rotate(numXRotations, numYRotations, userInitiated) {
    if (typeof userInitiated === 'undefined') { userInitiated = true; }
    if (userInitiated && !userRotateEnabled) {
        return;
    }

    currImgIndex = [mod(currImgIndex[0] - numXRotations, numImgs[0]), mod(currImgIndex[1] - numYRotations, numImgs[1])];
    prevImg = currImg;
    currImg = imgs[currImgIndex[0]][currImgIndex[1]];
    preloadImgs();
    drawCurrImg(numXRotations, numYRotations);
}

function pan(xSteps, ySteps, userInitiated) {
    if (typeof userInitiated === 'undefined') { userInitiated = true; }
    if (userInitiated && !userZoomEnabled) {
        return;
    }

    clearImg();
    imgTopLeft = [imgTopLeft[0] + (xSteps * PAN_STEP) / currZoom, imgTopLeft[1] + (ySteps * PAN_STEP) / currZoom];
    drawCurrImg(0, 0);
}

function zoom(steps, userInitiated) {
    if (typeof userInitiated === 'undefined') { userInitiated = true; }
    if (userInitiated && !userZoomEnabled) {
        return;
    }

    clearImg();

    var amount = 1;
    if (steps > 0) {
        amount = Math.pow(ZOOM_IN_STEP, steps);
    } else if (steps < 0) {
        amount = Math.pow(ZOOM_OUT_STEP, -steps);
    }

    window.cc.scale(amount,amount);
    currZoom = currZoom * amount;
    drawCurrImg(0, 0);
}



/*
MOUSE EVENTS
*/

function mouseZoom(e) {
    var nDelta = 0;

    //This block from http://www.experts-exchange.com/Programming/Languages/Scripting/JavaScript/A_2281-Mouse-Wheel-Programming-in-JavaScript.html
    if (e.wheelDelta) {
        nDelta = e.wheelDelta;
        if (window.opera) {
            nDelta = -nDelta;
        }
    } else if (e.detail) {
        nDelta = -e.detail;
    }
    
    if (nDelta > 0) {
        zoom(1);
    } else {
        zoom(-1);
    }
}

function startDrag(e) {
    //TODO: IE8 may have different button indexes
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
    if (typeof dragStart === 'undefined') { return; }

    var xDragDistance = e.screenX - dragStart[0];
    var yDragDistance = e.screenY - dragStart[1];

    if (rotateDragStarted) {
        if (xDragDistance >= ROTATE_DRAG_DISTANCE) {
            rotate(1, 0);
            dragStart[0] = e.screenX;
        } else if (xDragDistance <= -ROTATE_DRAG_DISTANCE) {
            rotate(-1, 0);
            dragStart[0] = e.screenX;
        }
        
        if (yDragDistance >= ROTATE_DRAG_DISTANCE) {
            rotate(0, -1);
            dragStart[1] = e.screenY;
        } else if (yDragDistance <= -ROTATE_DRAG_DISTANCE) {
            rotate(0, 1);
            dragStart[1] = e.screenY;
        }
    } else if (panDragStarted) {
        if (xDragDistance >= PAN_DRAG_DISTANCE) {
            pan(1, 0);
            dragStart[0] = e.screenX;
        } else if (xDragDistance <= -PAN_DRAG_DISTANCE) {
            pan(-1, 0);
            dragStart[0] = e.screenX;
        }
        
        if (yDragDistance >= PAN_DRAG_DISTANCE) {
            pan(0, 1);
            dragStart[1] = e.screenY;
        } else if (yDragDistance <= -PAN_DRAG_DISTANCE) {
            pan(0, -1);
            dragStart[1] = e.screenY;
        }
    }
}

function stopDrag(e) {
    rotateDragStarted = false;
    panDragStarted = false;
}



/*
AUTO-ROTATE AND OTHER
*/

function resetPanAndZoom() {
    clearImg();
    window.cc.setTransform(1, 0, 0, 1, 0, 0);
    initCanvas();
    drawCurrImg(0, 0);
}

function startAutoRotate() {
    disableButtons(ROTATE_BUTTONS_CLASS);
    userRotateEnabled = false;

    autoRotationTimer = window.setTimeout(function() { autoRotate(0) }, AUTO_ROTATE_INTERVAL);
}

function stopAutoRotate() {
    enableButtons(ROTATE_BUTTONS_CLASS);
    userRotateEnabled = true;

    window.clearTimeout(autoRotationTimer);
}

function autoRotate(numRotations) {
    if (currImg.hasLoaded) {
        if (numRotations == numImgs[0]) {
            rotate(0, -1, false);
            numRotations = 0;
        } else {
            rotate(1, 0, false);
            numRotations = numRotations + 1;
        }
        autoRotationTimer = window.setTimeout(function() { autoRotate(numRotations) }, AUTO_ROTATE_INTERVAL);
    } else {
        autoRotationTimer = window.setTimeout(function() { autoRotate(numRotations) }, 100);
    }
}



/*
TRANSITIONS
*/

//Changes straight to the next image
function noTransition(prevImg, currImg, xTransitionDirection, yTransitionDirection) {
    clearImg();
    window.cc.drawImage(currImg, imgTopLeft[0], imgTopLeft[1]);
}

//Fades between images
function fadeTransition(prevImg, currImg, xTransitionDirection, yTransitionDirection) {
    var currOpacity = 0.0;
    transitionTimerOrId = requestAnimFrame(function() { doFadeTransition(prevImg, currImg, currOpacity) } );
}

function doFadeTransition(prevImg, currImg, currOpacity) {
    clearImg();

    if (prevImg) {
        window.cc.globalAlpha = 1.0 - currOpacity;
        window.cc.drawImage(prevImg, imgTopLeft[0], imgTopLeft[1]);
    }

    window.cc.globalAlpha = currOpacity;
    window.cc.drawImage(currImg, imgTopLeft[0], imgTopLeft[1]);
    currOpacity = currOpacity + 0.1;

    window.cc.globalAlpha = 1.0;

    if (currOpacity <= 1.0) {
        transitionTimerOrId = requestAnimFrame(function() { doFadeTransition(prevImg, currImg, currOpacity) });
    }
}

//Fades between images while scaling in the direction of rotation
function directionalFadeTransition(prevImg, currImg, xTransitionDirection, yTransitionDirection) {
    var currOpacity = 0.0;
    var currScale = 0.0;
    transitionTimerOrId = requestAnimFrame(function() { doDirectionalFadeTransition(prevImg, currImg, currOpacity, currScale, xTransitionDirection, yTransitionDirection) });

}

function doDirectionalFadeTransition(prevImg, currImg, currOpacity, currScale, xTransitionDirection, yTransitionDirection) {
    clearImg();

    if (prevImg) {
        var prevOrigin = [imgTopLeft[0], imgTopLeft[1]];
        //Right and up rotations are positive
        //For some rotations, origin of image (it's top-left corner) must change as scaling occurs
        if (xTransitionDirection > 0) {
            prevOrigin[0] = prevOrigin[0] + currScale * prevImg.naturalWidth;
        } else if (yTransitionDirection < 0) {
            prevOrigin[1] = prevOrigin[1] + currScale * prevImg.naturalHeight;
        }

        window.cc.globalAlpha = 1 - currOpacity;
        if (xTransitionDirection != 0) {
            window.cc.drawImage(prevImg, 0, 0, prevImg.naturalWidth, prevImg.naturalHeight, prevOrigin[0], prevOrigin[1], (1 - currScale) * prevImg.naturalWidth, currImg.naturalHeight);
        } else if (yTransitionDirection != 0) {
            window.cc.drawImage(prevImg, 0, 0, prevImg.naturalWidth, prevImg.naturalHeight, prevOrigin[0], prevOrigin[1], currImg.naturalWidth, (1 - currScale) * prevImg.naturalHeight);
        }
    }

    var currOrigin = [imgTopLeft[0], imgTopLeft[1]];
    //For some rotations, origin of image (it's top-left corner) must change as scaling occurs
    if (xTransitionDirection < 0) {
        currOrigin[0] = currOrigin[0] + (1 - currScale) * prevImg.naturalWidth;
    } else if (yTransitionDirection > 0) {
        currOrigin[1] = currOrigin[1] + (1 - currScale) * prevImg.naturalHeight;
    }

    window.cc.globalAlpha = currOpacity;
    if (xTransitionDirection != 0) {
        window.cc.drawImage(currImg, 0, 0, currImg.naturalWidth, currImg.naturalHeight, currOrigin[0], currOrigin[1], currScale * currImg.naturalWidth, currImg.naturalHeight);
    } else if (yTransitionDirection != 0) {
        window.cc.drawImage(currImg, 0, 0, currImg.naturalWidth, currImg.naturalHeight, currOrigin[0], currOrigin[1], currImg.naturalWidth, currScale * currImg.naturalHeight);
    }

    window.cc.globalAlpha = 1.0;

    currOpacity = currOpacity + 0.1;
    currScale = currScale + 0.1;

    if (currOpacity <= 1.0) {
        transitionTimerOrId = requestAnimFrame(function() { doDirectionalFadeTransition(prevImg, currImg, currOpacity, currScale, xTransitionDirection, yTransitionDirection) });
    }
}



/*
UTILS
*/

function mod(a, b) {
    var result = a % b;
    if (result < 0) {
        result = result + b
    }
    return result;
}

//This shim from http://paulirish.com/2011/requestanimationframe-for-smart-animating/
//Only Firefox seems to support cancelAnimationFrame, so only using its request function
//for the time being
window.requestAnimFrame = (function() {
    return window.mozRequestAnimationFrame    || 
           function(callback) {
               window.setTimeout(callback, 1000 / 60);
           };
})();

function disableButtons(buttonsClass) {
    var buttons = document.getElementsByClassName(buttonsClass);
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
    }
}

function enableButtons(buttonsClass) {
    var buttons = document.getElementsByClassName(buttonsClass);
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = false;
    }
}

return {
    initViewer : initViewer,

    rotate : rotate,
    pan : pan,
    zoom : zoom,

    startAutoRotate : startAutoRotate,
    stopAutoRotate : stopAutoRotate,
    resetPanAndZoom : resetPanAndZoom,

    noTransition : noTransition,
    fadeTransition : fadeTransition,
    directionalFadeTransition : directionalFadeTransition
};

})();
