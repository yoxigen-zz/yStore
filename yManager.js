yManager = function () {
    var objIndex = 0,
        manager = this,
        privateKey = (new Date()).valueOf(),
        methods = [],
        map = {},
        undefined;

    function validatePath(str) {
        if (!str || typeof (str) !== "string")
            throw new TypeError("Invalid path for the data item.");

        return true;
    }

    // Finds an object inside the manager.
    this.find = function (name, key, withMap) {
        if (!name)
            return withMap && key === privateKey ? { currentPath: manager, currentMapPath: map} : manager;

        validatePath(name);

        var pathMembers = name.split("."),
            currentPath = manager,
            currentMapPath = map;

        for (var i = 0; i < pathMembers.length; i++) {
            currentPath = currentPath[pathMembers[i]];
            currentMapPath = currentMapPath[pathMembers[i]];
            if (typeof (currentPath) === "undefined")
                return;
        }

        return withMap && key === privateKey ? { currentPath: currentPath, currentMapPath: currentMapPath} : currentPath;
    };
    this.each = function(name, callback, deep, key, root) {
        if (!callback)
            return;

        root = root !== undefined && key !== undefined && key === privateKey ? root : this.find(name, privateKey, true);

        for (pName in root.currentMapPath) {
            if (pName !== "__value") {
                var path = (name !== undefined ? name + "." : "") + pName;
                if (root.currentMapPath[pName].__value) {
                    if (root.currentPath[pName] === undefined) {
                        delete root.currentMapPath[pName]; // Remove entries in map if no corresponding entry exists in manager (if the property's been deleted externally)
                    }
                    else {
                        var context = {
                            path: path,
                            name: pName,
                            value: root.currentPath[pName],
                            parent: root.currentPath
                        };

                        if (deep)
                            manager.each(path, callback, true, privateKey, { currentMapPath: root.currentMapPath[pName], currentPath: root.currentPath[pName] });

                        callback.call(context, context.value);
                    }
                }
                else if (deep)
                    manager.each(path, callback, true, privateKey, { currentMapPath: root.currentMapPath[pName], currentPath: root.currentPath[pName] });
            }
        }

        return this;
    };

    function getNamespaceByName(name, allowExists) {
        validatePath(name);

        var pathMembers = name.split("."),
            currentPathMember = 0;

        // Returns the namespace specified in the path. If the ns doesn't exists, creates it.
        // If an object exists with the same name, but it isn't an object, an error is thrown.
        function getNamespace(parent) {
            var root = manager;
            if (pathMembers.length === 1) {
                if (!allowExists && root[name])
                    throw new Error("Specified name already exists: " + name);

                return { ns: root, map: map, endpoint: name };
            }

            var nsName = pathMembers[currentPathMember],
                returnNs,
                existingNs;

            parent = parent || { ns: root, map: map };
            existingNs = parent.ns[nsName];

            if (!existingNs) {
                returnNs = { ns: parent.ns[nsName] = {}, map: parent.map[nsName] = {} };
            }
            else if (typeof existingNs === "object")
                returnNs = { ns: existingNs, map: parent.map[nsName] };
            else
                throw new Error("Specified namespace exists and is not an object: " + name);

            if (++currentPathMember < pathMembers.length - 1) {
                returnNs = getNamespace(returnNs);
            }

            returnNs.endpoint = pathMembers[pathMembers.length - 1];
            return returnNs;
        }

        return getNamespace();
    }
    // Adds a value to the manager.
    this.register = function (name, o) {
        if (typeof (o) === "object") {
            o.ID = ++objIndex;
        }

        var nameSpace = getNamespaceByName(name);
        nameSpace.ns[nameSpace.endpoint] = o;
        nameSpace.map[nameSpace.endpoint] = { "__value": true };

        if (o.subscribes) {
            for (eventName in o.subscribes) {
                this.subscribe(o, eventName, o.subscribes[eventName]);
            }
        }

        return this;
    };

    this.unregister = function (name) {
        var nameSpace = getNamespaceByName(name, true),
            o;

        if (!nameSpace || typeof (nameSpace.ns[nameSpace.endpoint]) === undefined)
            throw new Error("Item to unregister not found.");

        o = nameSpace.ns[nameSpace.endpoint];
        if (o && o.ID)
            delete o.ID;

        delete nameSpace.ns[nameSpace.endpoint];
        delete nameSpace.map[nameSpace.endpoint];

        return this;
    };

    for (methodName in this) {
        if (this.hasOwnProperty(methodName)) {
            methods.push(methodName);
        }
    }
};