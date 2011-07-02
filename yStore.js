Date.prototype.toJSON = function (key) {
    return ('\/Date(' + this.valueOf() + ')\/');
};

yStore = function (repositoryName, options) {
    var repo = this;

    if (!repositoryName || typeof (repositoryName) !== "string")
        throw new Error("Can't create a repository without a name.");

    var dataMgr = new yManager(),
        undefined;

    function getLocalStorageKey(path) {
        return repositoryName + "." + path;
    }

    function yStoreDataItem(dataItem) {
        for (var pName in dataItem) {
            if (dataItem.hasOwnProperty(pName)) {
                this[pName] = dataItem[pName];
            }
        }
    }

    function init(dataItem) {
        if (!dataItem.initialized) {
            if (dataItem.onInit)
                dataItem.onInit.call(dataItem, dataItem.data);

            dataItem.initialized = true;
        }
    }

    function saveData(dataItem, data, onSave, existingDataItem) {
        var localStorageKey = getLocalStorageKey(dataItem.path),
            expiresTimeout,
            expired = false,
            changeData;

        if (dataItem.testChange) {
            changeData = !!dataItem.testChange(dataItem.data, data);
        }

        if (changeData !== false) {
            dataItem.data = data;
            changeData && dataItem.onChange && dataItem.onChange.call(dataItem, data);

            // If null or undefined data is specified and there's data in the specified path, remove the data.
            if (existingDataItem !== undefined) {
                (existingDataItem instanceof yStoreDataItem ? existingDataItem : new yStoreDataItem(existingDataItem)).remove();

                if (dataItem.data === undefined || dataItem.data === null)
                    return undefined;
            }

            if (dataItem.expires !== undefined) {
                var typeofExpires = typeof (dataItem.expires),
                    valueOfNow = (new Date()).valueOf();

                if (dataItem.expires === null || dataItem.expires === false)
                    dataItem.expires = 0;

                if (typeofExpires === "object" && (dataItem.expires instanceof Date)) {
                    dataItem.expires = dataItem.expires.valueOf();
                }
                else if (typeofExpires === "number") {
                    dataItem.expires += valueOfNow;
                }

                if (typeof (dataItem.expires) !== "number") {
                    throw new TypeError("Invalid value for data 'expires' property, expected date or number.");
                }

                expiresTimeout = dataItem.expires - (new Date()).valueOf();
                expired = expiresTimeout <= 0;
            }

            if (!dataItem.isPersisted || changeData === true) {
                if (dataItem.persist !== false && !expired) {
                    dataItem.save();
                    dataItem.data = data;
                }
                else if (localStorage[localStorageKey] !== undefined) {
                    localStorage.removeItem(localStorageKey);
                }
            }

            if (expired)
                return;

            if (!dataMgr.find(dataItem.path))
                dataMgr.register(dataItem.path, dataItem);

            if (dataItem.expires && expiresTimeout > 0) {
                setTimeout(function () {
                    dataItem.remove();

                    if (dataItem.onExpire)
                        dataItem.onExpire(dataItem);

                }, expiresTimeout);
            }

            if (onSave)
                onSave.call(dataItem, dataItem.data);
        }

        doAutoUpdate(dataItem, existingDataItem);

        init(dataItem);
        return dataItem;
    }

	function doAutoUpdate(dataItem, existingDataItem, useLastUpdate) {
        if (dataItem.autoUpdate && dataItem.updateInterval && !dataItem.postpone && dataItem.getData) {
            var timeoutTime = useLastUpdate && dataItem.lastUpdate ? Math.max((dataItem.lastUpdate - (new Date())) + dataItem.updateInterval, 0) : dataItem.updateInterval;

            dataItem.refreshTimeoutId = setTimeout(function () {
                dataItem.getData(function (data, onSave) {
                    saveData(dataItem, data, onSave, existingDataItem);
                }, dataItem.getDataParam);
            }, timeoutTime);
        }
    }
	
    function validateRepoDataItem(repoDataItem) {
        if (!(repoDataItem instanceof yStoreDataItem))
            throw TypeError("Invalid thisArg, expected a RepoDataItem object.");
    }

    yStoreDataItem.prototype = {
        // Writes the data item's data to storage.
        save: function () {
            validateRepoDataItem(this);
            var data = this.data;
            localStorageKey = getLocalStorageKey(this.path);

            this.dataType = typeof (this.data);
            if (this.dataType === "object") {
                switch (this.data.constructor) {
                    case Date:
                        this.data = this.data.valueOf();
                        this.dataType = "date";
                        break;
                    case Array:
                        this.data = JSON.stringify({ array: this.data });
                        this.dataType = "array";
                        break;
                    default:
                        this.data = JSON.stringify(this.data);
                        break;
                }
            }

            if (this.data === undefined || this.data === null && !!localStorage[localStorageKey]) {
                localStorage.removeItem(localStorageKey);
                this.isPersisted = false;
            }
            else {
				this.lastUpdate = (new Date()).valueOf();
                localStorage.setItem(localStorageKey, JSON.stringify(this));
                this.isPersisted = true;
            }

            delete this.dataType;
            this.data = data;

            if (options.onSave)
                options.onSave(this);

            return this;
        },
        // Removes a data item (including data from storage).
        // Returns the removed data item.
        remove: function () {
            validateRepoDataItem(this);
            dataMgr.unregister(this.path);
            var localStorageKey = getLocalStorageKey(this.path);

            if (localStorage[localStorageKey] !== undefined)
                localStorage.removeItem(localStorageKey);

            if (this.isPersisted)
                delete this.isPersisted;

            if (this.onRemove)
                this.onRemove.call(this);

            return this;
        },
        // Starts the auto-updating interval. If already started, does nothing.
        // Returns the data item.
        start: function () {
            validateRepoDataItem(this);
            if (this.refreshTimeoutId === undefined) {
                this.autoUpdate = true;
                this.update();
            }

            return this;
        },
        // Stops the auto-updating interval, if it's on.
        // Returns the data item.
        stop: function () {
            validateRepoDataItem(this);
            if (this.refreshTimeoutId) {
                clearTimeout(this.refreshTimeoutId);
                delete this.refreshTimeoutId;
                this.autoUpdate = false;
            }

            return this;
        },
        // Forces an update of the data in the data item, using the getData function.
        // If auto-update was running, resets the timeout.
        // Returns the data item.
        update: function () {
            validateRepoDataItem(this);
            if (!this.getData)
                return false;

            var dataItem = this;

            if (this.autoUpdate && this.refreshTimeoutId) {
                clearTimeout(this.refreshTimeoutId);
                delete this.refreshTimeoutId;
            }

            this.getData.call(dataItem, function (data, onSave) {
                saveData(dataItem, data, onSave, dataItem);
            }, this.getDataParam);

            return this;
        }
    };

    /*
    Saves data to the repository.

    Two usages:
    1. setItem(path, data, [ifNotExists]) - see path and data below.
    2. setItem(dataItem):
    dataItem = {
    path: (string) The name or full path of the data inside the repository. Namespaces should be separated by dots
    data: (any value - object, string, boolean, number, function) The data to save.
    [persist=true]: (boolean) Whether to persist data to local storage. The default for this setting can be set in the options object of the repository.
    [expires]: (date || number) When this data item expires. If not specified, the data item doesn't expire. If a number is specified, it is the value in milliseconds before the item expires.
    [ifNotExists=false]: (boolean) If set to true, the data is set only if there's no data in the specified path.
    [getData]: (function) The function used to get data for this item. Has one parameter - callback (function(data)).
    [getDataParam]: (any value) An optional second parameter to be passed to the getData function when it's called.
    [testChange]: (function) A function used to test if new data is different than the existing data. Receives two parameters: (oldData, newData), both can have any value. Should return true if there was a change or false if not.
    [updateInterval]: (number) Time interval in milliseconds to call getData (if set).
    [postpone]: (boolean) If set to true and getData is specified, data isn't retrieved until an explicit update occurs, using start or update.
    [onExpire]: (function) A function to call when the data item expires.
    [onChange]: (function) A function to call when the data item is set to a different item.
    [onRemove]: (function) A function to call after the data item is deleted.
    [onInit]: (function) A function to call when data is first added to the item.
    [wait]: (number) Time in milliseconds to wait before calling getData, if data already exists. (grace time)
    }
    */
    this.setItem = function (dataItem) {
        var checkExists = true;

        if (arguments.length > 1) {
            if (typeof (arguments[0]) === "string") {
                dataItem = {
                    path: arguments[0],
                    data: arguments[1]
                };

                if (arguments.length === 3)
                    dataItem.ifNotExists = !!arguments[2];
            }
            else if (typeof (arguments[0]) === "object" && typeof (arguments[1]) === "boolean")
                checkExists = arguments[1];
        }

        if (!dataItem || !dataItem.path)
            throw new Error("dataItem or dataItem.path not specified.");

        if (dataItem.data === "undefined" && !dataItem.getData)
            throw new TypeError("Can't set data - missing data or getData function for the dataItem.");

        var existingDataItem = checkExists ? repo.getItem(dataItem.path, true) : undefined;

        if (dataItem.ifNotExists && existingDataItem) {
			doAutoUpdate(dataItem, existingDataItem, true);
            init(dataItem);
            return this;
        }

        if (existingDataItem && existingDataItem.refreshTimeoutId) {
            clearTimeout(existingDataItem.refreshTimeoutId);
        }

        if (!(dataItem instanceof yStoreDataItem))
            dataItem = new yStoreDataItem(dataItem);

        if (dataItem.postpone) {
            delete dataItem.postpone;
            dataMgr.register(dataItem.path, dataItem);
        }
        else {
            if (dataItem.data === undefined && dataItem.getData) {
                var doGetData = function () {
                    if (existingDataItem)
                        dataItem.data = existingDataItem.data;

                    dataItem.getData.call(dataItem, function (data, onSave) {
                        saveData(dataItem, data, onSave, existingDataItem);
                    }, dataItem.getDataParam);
                }
                if (existingDataItem && dataItem.wait) {
                    setTimeout(doGetData, dataItem.wait);
                    delete dataItem.wait;
                }
                else
                    doGetData();
            }
            else
                saveData(dataItem, dataItem.data, null, existingDataItem);
        }
        return dataItem;
    };

    /*
    Sets a group of items, with the same options for all.
    items: (array) Array of name-value objects - [{ path: item1Path, data: item1Data }, { path: item2Pat, data: item2Data }, ... }
    [options]: (object) Options object for setItem. See setItem.
    */
    this.setItems = function (items, options) {
        var createdItems = [];
        options = options || {};

        for (var i = 0, itemsCount = items.length; i < itemsCount; i++) {
            var item = items[i];
            if (typeof (item) === "object") {
                var dataItem = {};
                for (var optionName in options) {
                    if (options.hasOwnProperty(optionName)) {
                        dataItem[optionName] = options[optionName];
                    }
                }

                dataItem.path = item.path;
                dataItem.data = item.data;

                createdItems.push(repo.setItem(dataItem));
            }
        }

        return createdItems;
    };
    //Sat May 14 2011 15:52:41 GMT+0300
    /*
    Gets a data item, with all its properties (not just data as getData does).
    dataItemPath: (string) The path of the data item to get.
    avoidSet: (boolean) if set to true and an item is found only in localStorage, the item isn't added to the yStore, just returned. Used mainly internally.
    */
    this.getItem = function (dataItemPath, avoidSet) {
        var dataItem = dataMgr.find(dataItemPath),
            localStorageKey = getLocalStorageKey(dataItemPath);

        if (!dataItem) {
            var localStorageData = localStorage.getItem(localStorageKey);
            if (localStorageData) {
                localStorageData = JSON.parse(localStorageData);

                if (localStorageData.expires !== undefined && localStorageData.expires <= (new Date()).valueOf()) {
                    localStorage.removeItem(localStorageKey);
                }
                else {
                    switch (localStorageData.dataType) {
                        case "date":
                            localStorageData.data = new Date(localStorageData.data);
                            break;
                        case "array":
                            localStorageData.data = JSON.parse(localStorageData.data).array;
                            break;
                        case "object":
                            localStorageData.data = JSON.parse(localStorageData.data, function (key, value) {
                                var date;
                                if (typeof (value) === "string") {
                                    date = /^\/Date\((\d+)\)\/$/.exec(value);
                                    if (date)
                                        return new Date(Number(date[1]));
                                }

                                return value;
                            });
                            break;
                        default:
                            break;
                    }

                    localStorageData.isPersisted = true;

                    if (localStorageData.expires)
                        localStorageData.expires = new Date(localStorageData.expires);

					if (localStorageData.lastUpdate)
                        localStorageData.lastUpdate = new Date(localStorageData.lastUpdate);
						
                    dataItem = !avoidSet ? repo.setItem(localStorageData, false) : new yStoreDataItem(localStorageData);
                }
            }
        }

        return dataItem;
    };

    // Gets data for an item in the repository:
    this.getData = function (dataItemPath) {
        var dataItem = repo.getItem(dataItemPath);
        return dataItem ? dataItem.data : undefined;
    };

    // Removes all the items in the repository:
    this.clear = function (root) {
        dataMgr.each(root, function (e) {
            e.remove();
            delete this.parent[this.name];
        }, true);

        return this;
    };

    /*
    Traverses all the items in the repository and applies the supplied callback to each:
    [root]: (string) The item in the repository to start from. If none specified, traverse the whole repository.
    callback: (function) A function to call for each item. The function gets a single parameter - data. The item's metadata can be retrieved by using 'this' inside the function.
    [deep=true]: (boolean) Whether to traverse recursively or just inside the root. The default setting can be set in the repository's options object.
    */
    this.each = function (root, callback, deep) {
        if (typeof (arguments[0]) === "function") {
            if (arguments.length === 2 && typeof (arguments[1]) === "boolean")
                deep = arguments[1];

            callback = arguments[0];
            root = undefined;
        }

        if (!callback)
            return this;

        // Default recursion to true:
        if (deep !== false)
            deep = true;

        function repoCallback(dataItem) {
            callback.call(dataItem, dataItem.data);
        }

        dataMgr.each(root, repoCallback, deep);

        return this;
    };

    // Persists all the items in the repository to storage.
    this.save = function () {
        this.each(function () { this.save(); });
    }

    // Gets all the repository's items from storage.
    this.populate = function (callback) {
        var repoRegexp = new RegExp("^" + repositoryName + "\\.(.*)$");
        for (var itemKey in localStorage) {
            var repoMatch = itemKey.match(repoRegexp);
            if (repoMatch) {
                repo.getItem(repoMatch[1]);
            }
        }

        if (callback)
            callback.call(repo);
    };

    this.setOptions = function (newOptions) {
        options = $.extend(options, newOptions);
    };

    if (options && options.populate)
        this.populate(options.onPopulate);
};