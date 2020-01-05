var Component = require("montage/ui/component").Component,
    currentEnvironment = require("montage/core/environment").currentEnvironment,
    KeyComposer = require("montage/composer/key-composer").KeyComposer,
    DataOperation = require("montage/data/service/data-operation").DataOperation,
    UserIdentity = require("data/main.datareel/model/user-identity").UserIdentity;


var SignUp = exports.SignUp = Component.specialize({

    _isFirstTransitionEnd: {
        value: true
    },

    username: {
        value: void 0
    },

    password: {
        value: void 0
    },

    isBrowserSupported: {
        get: function () {
            return currentEnvironment.browserName == 'chrome';
        }
    },

    signUpButton: {
        value: void 0
    },

    passwordTextField: {
        value: void 0
    },

    usernameTextField: {
        value: void 0
    },

    hasError: {
        value: false
    },

    hadError: {
        value: false
    },

    _errorMessage: {
        value: null
    },

    errorMessage: {
        get: function () {
            return this._errorMessage;
        },
        set: function (errorMessage) {
            this._errorMessage = errorMessage;
            this.hasError = !!errorMessage;
        }
    },

    _isAuthenticating: {
        value: false
    },

    isAuthenticating: {
        set: function (isAuthenticating) {
            if (this._isAuthenticating !== isAuthenticating) {
                this._isAuthenticating = isAuthenticating;
                this._toggleUserInteraction();
            }
        },
        get: function () {
            return this._isAuthenticating;
        }
    },


    __keyComposer: {
        value: null
    },

    _keyComposer: {
        get: function () {
            if (!this.__keyComposer) {
                this.__keyComposer = new KeyComposer();
                this.__keyComposer.keys = "enter";
                this.__keyComposer.identifier = "enter";
                this.addComposerForElement(this.__keyComposer, this.element.ownerDocument.defaultView);
            }

            return this.__keyComposer;
        }
    },

    enterDocument: {
        value: function (isFirstTime) {

            //Check if the service has a knonw user:
            //TODO, we shouldn't be exposing a CognitoUser directly
            console.debug("FIX ME -> CognitoUser -> Phront User");
            // if(this.service.user) {
            //     this.username = this.service.user.getName();
            // }

            this.addEventListener("action", this, false);
            this._keyComposer.addEventListener("keyPress", this, false);
            this.element.addEventListener("transitionend", this, false);

            // checks for disconnected hash
            if(location.href.indexOf(";disconnected") > -1) {
                this.hasError = true;
                this.errorMessage = "Oops! Your token has expired. \n Please log back in.";
                location.href = location.href.replace(/;disconnected/g, '');
            }
            this.usernameTextField.focus();
        }
    },

    exitDocument: {
        value: function () {
            this.removeEventListener("action", this, false);
            this._keyComposer.removeEventListener("keyPress", this, false);
        }
    },


    handleKeyPress: {
        value: function (event) {
            if (event.identifier === "enter") {
                this.handleSignUpAction();
            }
        }
    },

    handleSignInAction: {
        value: function() {
            this.ownerComponent.substitutionPanel = "signIn";
        }
    },

    handleSignUpAction: {
        value: function() {
            var self = this,
                newIdentity;
            if (this._isAuthenticating || !this.username) {
                return;
            }
            this.isAuthenticating = true;
            this.hadError = false;
            newIdentity = this.application.mainService.createDataObject(UserIdentity);
            newIdentity.username = this.username;
            newIdentity.email = this.email;
            newIdentity.password = this.password;
            this.application.mainService.saveDataObject(newIdentity)
            .then(function (savedUserIdentity) {
                //set the userIdentity on the authentication panel
                //This might be best handled with bindings...
                self.ownerComponent.userIdentity = savedUserIdentity;

                self.isLoggedIn = true;

                // Don't keep any track of the password in memory.
                self.password = self.username = self.email = null;

                /*
                    We need to now show the email verification code component.
                    We can hard-code that for now, but need to check if that's hinted by Cognito that this is happenning, as it's a configurable behavior in Cognito.
                */

                self.ownerComponent.substitutionPanel = "enterVerificationCode";
            }, function (error) {
                self.hadError = true;
                if (error instanceof DataOperation) {
                    self.errorMessage = error.userMessage || error.message;
                } else {
                    self.errorMessage = error.message || error;
                }
            }).finally(function (value) {
                if (self.errorMessage) {
                    self.element.addEventListener(
                        typeof WebKitAnimationEvent !== "undefined" ? "webkitAnimationEnd" : "animationend", self, false
                    );
                }

                self.isAuthenticating = false;
            });
        }
    },

    handleTransitionend: {
        value: function (e) {
            if(this.isLoggedIn && e.target == this.element && e.propertyName == 'opacity') {
                this.element.style.display = 'none';
            } else if (this._isFirstTransitionEnd) {
                this._isFirstTransitionEnd = false;
                this.usernameTextField.focus();
            }
        }
    },

    handleAnimationend: {
        value: function () {
            if (this.errorMessage) {
                this.passwordTextField.value = null;
                this.passwordTextField.element.focus();

                this.element.removeEventListener(
                    typeof WebKitAnimationEvent !== "undefined" ? "webkitAnimationEnd" : "animationend", this, false
                );
            }
        }
    },

    _toggleUserInteraction: {
        value: function () {
            this.signUpButton.disabled = this._isAuthenticating;
            this.passwordTextField.disabled = this.usernameTextField.disabled = this._isAuthenticating;
        }
    }

});

SignUp.prototype.handleWebkitAnimationEnd = SignUp.prototype.handleAnimationend;
