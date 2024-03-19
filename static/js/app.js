'use strict';

var echo = angular.module('echo', ['ngRoute', 'ngStorage', 'smart-table']);

echo.directive('focusOn', function () {
    return function (scope, elem, attr) {
        scope.$on('focusOn', function (e, name) {
            if (name === attr.focusOn) {
                elem[0].focus();
            }
        });
    };
});

echo.factory('focus', function ($rootScope, $timeout) {
    return function (name) {
        $timeout(function () {
            $rootScope.$broadcast('focusOn', name);
        });
    };
});

echo.filter('unique', unique);
function unique() {
    return function (arry) {
        Array.prototype.getUnique = function () {
            var u = {}, a = [];
            for (var i = 0, l = this.length; i < l; ++i) {
                if (u.hasOwnProperty(this[i])) {
                    continue;
                }
                a.push(this[i]);
                u[this[i]] = 1;
            }
            return a;
        };
        if (arry === undefined || arry.length === 0) {
            return '';
        }
        else {
            return arry.getUnique();
        }

    };
}
// configure our routes
echo.config(function ($routeProvider) {
    $routeProvider

    // route for the home page
        .when('/', {
            templateUrl: 'partials/home.html',
            controller: 'homeController'
        })

        // route for the execute page
        .when('/execute', {
            templateUrl: 'partials/execute.html',
            controller: 'executeController'
        })

        // route for the login page
        .when('/login', {
            templateUrl: 'partials/login.html',
            controller: 'loginController'
        })

        // route for the logs page
        .when('/logs', {
            templateUrl: 'partials/logs.html',
            controller: 'logsController'
        })

        // route for the pcaps page
        .when('/pcaps', {
            templateUrl: 'partials/pcaps.html',
            controller: 'pcapsController'
        })

        // route for the usecase page
        .when('/usecase', {
            templateUrl: 'partials/usecase.html',
            controller: 'usecaseController'
        });
 //   $locationProvider.html5Mode(true);
});  //routes

// create the controller and inject Angular's $scope
echo.controller('homeController', function ($localStorage, $scope, $http, $location, focus) {

    $scope.$storage = $localStorage;
    focus('searchMode');
     // set our token
    $http.get('/api/token').success(function() {
        // grab our use cases
        $http.get("/api/usecase").success(function (data) {
            $scope.rowCollection = data.objects;
        });
    });

    $scope.executeUseCase = function (row) {
        $scope.$storage.use_case_id = row.id;
//        $rootScope.use_case_id = row.id;
        $location.path("/execute");
    };

});

echo.controller('loginController', function ($localStorage, $scope, $http, $location, focus ){

    $scope.$storage = $localStorage;
    focus('editMode');
    $scope.user = {};

    $scope.clearError = function () {
        $scope.login_error = null;
    };

    $scope.userLogin = function (user) {
        $scope.login_error = null;
        $http.post('api/login', user)
            .success (function (){
                $scope.$storage.is_Authenticated = true;
//                $rootScope.is_Authenticated = true;
                $location.path('/usecase');
            })
            .error (function (data){
                $scope.login_error = data.message;
            });

    };
});

//Execute use case controller
echo.controller('executeController', function ($localStorage, $scope, $http) {

    $scope.$storage = $localStorage;
    $scope.messages = [];
    var source = new EventSource('/api/execute/' + $scope.$storage.use_case_id);
    source.onmessage = function (event) {
        $scope.messages.push(event.data);
        console.log(event.data);
        $scope.$apply();
        if (event.data == '...') {
            source.close()
        }

    };

});

//Logs Controller
echo.controller('logsController', function ($localStorage, $scope, $location, $http, focus) {
    // set some initialization parameters
    $scope.$storage = $localStorage;
    $scope.log = null;

    // check to see where we can from
    if ($scope.$storage.referrer != "/usecase") {
        $location.path("/usecase");
    }

    focus('searchMode');
    // grab our use cases so we can work with associated logs
    $http.get("/api/usecase/" + $scope.$storage.use_case_id).success(function (data) {
        $scope.rowCollection = data.logs;
        $scope.usecasename = data.title;
    });

    // add a new log
    $scope.addLog = function () {
        $scope.log = {
            owner_id: '',
            description: '',
            message: '',
            log: ''
        };
        focus('editMode');
    };

    // edit existing log
    $scope.editLog = function (row) {

        $http.get("/api/usecase/" + $scope.$storage.use_case_id + "/logs/" + row.id).success(function (data) {
            $scope.log = data;
            focus('editMode');
        })
    };

    //delete log
    $scope.deleteLog = function (row) {
        $http.delete("/api/usecase/" + $scope.$storage.use_case_id + "/logs/" + row.id).success(function () {
            $scope.rowCollection.splice($scope.rowCollection.indexOf(row), 1)
        });
    };

    // save add/edit
    $scope.saveLog = function (log) {

        if (log.id == null) {
            $scope.rowCollection.push(log);
            $http.patch("/api/usecase/" + $scope.$storage.use_case_id, {'logs': {'add': log}}).success(function (data) {
                $scope.rowCollection = data.logs;

            });
         }

        if (log.id) {
            $scope.rowCollection.splice($scope.rowCollection.indexOf(log), 0, log);
            $http.patch("/api/usecase/" + $scope.$storage.use_case_id, {'logs': $scope.rowCollection}).success(function (data){
                $scope.rowCollection = data.logs;

            });

        }

        $scope.log = null;
        focus('searchMode');

    };

    $scope.cancelLog = function () {
        $scope.log = null;
        focus('searchMode');
    };

    //return to use case oage
    $scope.allDone = function () {
        $location.path("/usecase");
    };

});

echo.controller('pcapsController', function ($localStorage,  $scope, $location, $http, focus) {
    // set some initialization parameters
    $scope.$storage = $localStorage;
    $scope.pcap = null;
    $scope.canUpload = false;

    // check to see where we can from
    if ($scope.$storage.referrer != "/usecase") {
        $location.path("/usecase");
    }

    focus('searchMode');

    // grab our use cases so we can work with associated pcaps
    $http.get('/api/usecase/' + $scope.$storage.use_case_id ).success(function (data) {
        $scope.rowCollection = data.pcaps;
        $scope.usecase = data;

    });

    $scope.addPcap = function () {
        $scope.pcap = {};
        $scope.upload_error = null;
        focus('editMode');
    };

    $scope.editPcap = function (row) {
        $scope.canUpload = false;
        $http.get("/api/usecase/" + $scope.$storage.use_case_id + "/pcaps/" + row.id).success(function (data) {
            $scope.pcap = data;
            focus('editMode');

        });

    };

    $scope.savePcap = function (pcap) {
        $scope.upload_error = null;

        var f = document.getElementById('file').files[0];
        console.log(f);
        var formData = new FormData();
        formData.append('file', f);

        $http({
            method: 'POST', url: '/api/upload',
            data: formData,
            headers: {'Content-Type': undefined},
            transformRequest: angular.identity
        })
            .success(function (data) {
                pcap.filename = data.filename;
                $http.patch('/api/usecase/' + $scope.$storage.use_case_id, {'pcaps': {'add': pcap}}).success(function (data){
                    $scope.rowCollection = data.pcaps;
                });


            })
            .error(function (data, status) {
                $scope.upload_error = data.message;
                console.log($scope.upload_error);
            });

        $scope.pcap = null;
        focus('searchMode');
    };


    $scope.deletePcap = function (row) {
        var record = angular.fromJson(row);
        console.log(record);
        $http.delete("/api/usecase/" + $scope.$storage.use_case_id + "/pcaps/" + row.id).success(function () {
            $scope.rowCollection.splice($scope.rowCollection.indexOf(row), 1)
        });

    };

    //return to use case case
    $scope.allDone = function () {
        $location.path("/usecase");
    };


    $scope.cancelPcap = function () {
        $scope.pcap = null;
        focus('searchMode');
    };
});

//Use case controller
echo.controller('usecaseController', function ($localStorage, $scope, $http, $location, focus) {

    $scope.$storage = $localStorage;

    if ($scope.$storage.is_Authenticated != true) {
        $location.path('/login');
    }

    $scope.usecase = null;
    focus('searchMode');

    // grab our use cases
    $http.get("/api/usecase").success(function (data) {
        $scope.rowCollection = data.objects;
    });

    //add use case
    $scope.addUseCase = function () {
        $scope.usecase = {needslogs: true};
        focus('editMode');

    };

    //edit use case
    $scope.editUseCase = function (row) {

        $http.get("/api/usecase/" + row.id).success(function (data) {
            $scope.usecase = data;
            focus('editMode');
        });

    };

    //delete use case
    $scope.deleteUseCase = function (row) {
        $http.delete("/api/usecase/" + row.id).success(function () {
            $scope.rowCollection.splice($scope.rowCollection.indexOf(row), 1)
        });
    };

    //edit logs for use case
    $scope.editLogs = function (row) {
        $scope.$storage.use_case_id = row.id;
        $scope.$storage.referrer = $location.path();
        $location.path("/logs");
    };

    //edit pcaps
    $scope.editPcaps = function (row) {
        $scope.$storage.use_case_id = row.id;
        $scope.$storage.referrer = $location.path();
        $location.path("/pcaps");
    };

    //save add/edit
    $scope.saveUseCase = function (usecase) {

        if (usecase.id == null) {
            $http.post("/api/usecase", usecase).success(function () {
                $http.get("/api/usecase").success(function (data) {
                    $scope.rowCollection = data.objects;

                });
            });

        }

        if (usecase.id) {
            $http.patch("/api/usecase/" + usecase.id, usecase).success(function () {
                $http.get("/api/usecase").success(function (data) {
                    $scope.rowCollection = data.objects;

                });
            });

        }
        $scope.usecase = null;
        focus('searchMode');
    };

    $scope.cancelUseCase = function () {
        $scope.usecase = null;
        focus('searchMode');
    };

}); //end module
