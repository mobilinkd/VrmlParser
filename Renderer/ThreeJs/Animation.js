/**
 * @author Bart McLeod, mcleod@spaceweb.nl
 * @since May 25, 2016
 *
 * @todo: Understand http://threejs.org/docs/#Reference/Extras.Animation/AnimationHandler, this code might duplicate for example removing an animation from the update loop
 *
 * Adds animation and interaction support to the VrmlParser.Renderer.ThreeJs
 */
var VrmlParser = VrmlParser || {};

VrmlParser.Renderer = VrmlParser.Renderer || {};

VrmlParser.Renderer.ThreeJs = VrmlParser.Renderer.ThreeJs || {};

/**
 * Offers support for interaction and animation.
 *
 * Currently support clicking an object and seeing a log message for that.
 *
 * Also, in debug mode, a blue line will be drawn from the perspective camera to the clicked point.
 * You can see this line when zooming out after clicking and object.
 *
 * @param scene
 * @param camera
 * @param renderer
 * @param debug
 * @constructor
 */
VrmlParser.Renderer.ThreeJs.Animation = function (scene, camera, renderer, debug) {
  // @todo: support for multiple cameras or just re-initialize with a new camera when switched to one?
  this.camera = camera;
  this.scene = scene;
  this.renderer = renderer;
  this.debug = debug ? true : false;
  this.animations = {};
};

VrmlParser.Renderer.ThreeJs.Animation.prototype = {
  /**
   * Updates or registered animations with a delta from the global clock.
   *
   * @param delta
   */
  update: function (delta) {
    for ( var a in this.animations ) {
      if ( !this.animations.hasOwnProperty(a) ) {
        continue;
      }
      var callback = this.animations[a];
      callback(delta);
    }
  },

  /**
   * Register a callback for the animations, it will be called at each tick with a delta
   * from the global clock.
   *
   * @param name
   * @param callback
   */
  addAnimation: function (name, callback) {
    this.animations[name] = callback;
  },

  /**
   * Unregister a callback for the animations.
   * @param name
   */
  removeAnimation: function (name) {
    delete this.animations[name];
  },

  /**
   * Gets all routes that were registered for a sensor in the original VRML world.
   *
   * Returned routes have a source and target object. Each have a name and event property.
   *
   * @param string name Name of the source node of the event.
   * @returns {*}
   */
  getRoutesForEvent: function (name) {
    var routesRegistry = this.scene.userData.routes;
    var routes = routesRegistry[name];
    //this.log('The routes are:');

    for ( var r = 0; r < routes.length; r++ ) {
      //this.log(routes[r]);
    }
    return routes;
  },

  /**
   * Recursively finds all targetroutes for a given route.
   *
   * @param triggerRoute
   * @returns {boolean}
   */
  findTargetRoutes: function (triggerRoute) {
    var targetRoutes = [];

    if ( 'undefined' === typeof triggerRoute ) {
      return targetRoutes;
    }

    var routesRegistry = this.scene.userData.routes;

    if ( 'undefined' === typeof routesRegistry[triggerRoute.target.name] ) {
      // this is the leaf route
      return triggerRoute;
    }

    // 1. Find first level of targetRoutes (they can be chained)
    var routes = routesRegistry[triggerRoute.target.name];

    // find all the target routes of intermediate routes
    for ( var i = 0; i < routes.length; i++ ) {

      var route = routes[i];

      // verify if the route has yet another target (it is an intermediate route)

      // 2. Find targetroutes of intermediate route, create a nested array
      var nestedTargetRoutes = this.findTargetRoutes(route);
      targetRoutes.push(nestedTargetRoutes);
    }

    // 3. Return targetroute
    return targetRoutes;
  },

  /**
   * Utility to easily switch logging on and off with the debug flag.
   * @param obj
   */
  log: function(obj){
    if (this.dedug) {
      console.log(obj);
    }
  },

  /**
   * Goes up the object tree recursively to find an object with an originalVrmlNode that is of a sensorType,
   * for example a TouchSensor.
   *
   * @param Object3D the clicked shape.
   * @param string sensorType
   * @returns {boolean}|{string} name of the sensor or false.
   */
  findSensor: function (object, sensorType) {
    if (null === object) {
      this.log('Cannot find a sensor in null');
      return false;
    }

    if ('undefined' === typeof object.parent || null === object.parent) {
      this.log('We cannot go up the tree any further');
      // we're out of parents, there's not a single sensorType to be found here.
      return false;
    }

    for ( var b = 0; b < object.parent.children.length; b++ ) {
      var checkNode = object.parent.children[b];
      if ( 'undefined' !== typeof checkNode.userData.originalVrmlNode
        && sensorType === checkNode.userData.originalVrmlNode.node ) {
        // do a proof of concept here, but ideally, only trigger an already registered animation
        /*
         For a quick proof of concept, you can use slerp and the endpoint of a rotation interpolator
         from the orignial animation. For that you need to combine the routes and get the names.
         */
        // find the first route, we only use TimeSensor to get from one to the next
        var eventName = checkNode.name;
        if (this.debug) {
          this.log(sensorType + ': ' + eventName);
        }
        return eventName;
      }
    }

    this.log('No ' + sensorType + ' in parent');

    this.log('Searching up the tree');
    // not found in the parent object, look in its parent in turn (go up the object tree recursively)
    return this.findSensor(object.parent, sensorType);
  },

  // @todo: support more interactions than just clicking

  /**
   * Support clicking the scene.
   *
   * If an object is clicked, it will show up in here. If a handler was registered for it,
   * we can execute the handler.
   *
   * Handlers will be registered by parsing VRML ROUTES for TouchSensors.
   *
   * Example:
   * ROUTE klikopdeur.touchTime TO TimeSource.startTime
   * ROUTE TimeSource.fraction_changed TO Deuropen.set_fraction
   * ROUTE Deuropen.value_changed TO deur.rotation
   *
   * @todo: translate event names to English, so that they make sense to people who are not able to read Dutch
   * The example is a three-step animation script:
   * 1. The touchTime of the touch sensor is routed to the time source. We can translate this step, since we have
   * a clock and a click event
   */
  addClickSupport: function () {
    // do some POC click support here YOU MAY DEPEND ON THREEJS, BUT NEED TO LOAD THE DEPENDENCIES FROM THE EXAMPLES DIR
    // THERE IS A CIRCULAR DEPENDENCY, SINCE VRMLLOADER NOW DEPENDS ON VRMLPARSER AND VRMLPARSER EXAMPLES DEPEND ON THREEJS, BUT ONLY THE EXAMPLES
    // clicking: enable clicking on the screen to interact with objects in the 3D world
    projector = new THREE.Projector();
    var line;
    var scope = this;

    this.renderer.domElement.addEventListener('mousedown', function (event) {
        var camera = scope.camera;
        var scene = scope.scene;
        var renderer = scope.renderer;

        var x = event.offsetX == undefined ? event.layerX : event.offsetX;
        var y = event.offsetY == undefined ? event.layerY : event.offsetY;

        var vector = new THREE.Vector3();
        vector.set(( x / renderer.domElement.width ) * 2 - 1, -( y / renderer.domElement.height ) * 2 + 1, 0.5);

        vector.unproject(camera);

        var raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());

        var objects = scene.children;
        var intersects = raycaster.intersectObjects(objects, true);

        if ( intersects.length ) {
          var firstIntersect = intersects[0].object;

          var touch = scope.findSensor(firstIntersect, 'TouchSensor');

          if ( false === touch ) {
            // no touch sensor found
            return;
          }

          // work on a clone [slice(0)] of the routes, otherwise, using pop() will make the array useless for next time
          var routes = scope.getRoutesForEvent(touch).slice(0);

          // naive, only use first
          var targetRoutes = scope.findTargetRoutes(routes.pop());

          // again, naive (good usecase for map reduce?
          var targetRoute = targetRoutes;

          while ( 'function' === typeof targetRoute.pop ) {
            targetRoute = targetRoute.pop();

            if ( 'undefined' === typeof targetRoute ) {
              scope.log('no target route found for ' + touch);
              return;
            }
          }

          // we found the leaf targetRoute
          scope.log('target: ' + targetRoute);

          var originalNode = scene.getObjectByName(targetRoute.source.name).userData.originalVrmlNode;

          // any supported interpolator will work, for now, only OrientationInterpolator
          if ('undefined' === typeof VrmlParser.Renderer.ThreeJs.Animation[originalNode.node]) {
            scope.log(originalNode.node + ' is not yet supported');
            return;
          }

          var interpolator = new VrmlParser.Renderer.ThreeJs.Animation[originalNode.node](originalNode);

          var name = 'surrounding_' + targetRoute.target.name;
          var target = scene.getObjectByName(name);

          // cleanup method for when the callback wants to be removed because it's done.
          var finish = function(){
            scope.removeAnimation(touch);
          };

          var callback = interpolator.getCallback(target, finish);
          scope.addAnimation(touch, callback);
        }

        if ( true === scope.debug ) {
          // draw a line where the object was clicked
          if ( null !== line ) {
            scene.remove(line);
          }

          var lineMaterial = new THREE.LineBasicMaterial({
            color: 0x0000ff
          });
          var geometry = new THREE.Geometry();

          geometry.vertices.push(new THREE.Vector3(raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z));
          geometry.vertices.push(new THREE.Vector3(raycaster.ray.origin.x + (raycaster.ray.direction.x * 100000), raycaster.ray.origin.y + (raycaster.ray.direction.y * 100000), raycaster.ray.origin.z + (raycaster.ray.direction.z * 100000)));
          line = new THREE.Line(geometry, lineMaterial);
          scene.add(line);
          // / draw a line
        }

      }
      ,
      false
    );
    // / clicking

  }
};

