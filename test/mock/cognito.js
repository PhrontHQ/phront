var uuid = require("montage/core/uuid");

var BASE_USER_INFOS = {
    "confirmed": {
        username: "confirmed",
        password: "password",
        email: "confirmed@mail.com",
        sub: uuid.generate()
    },
    "unconfirmed": {
        username: "unconfirmed",
        password: "password",
        email: "unconfirmed@mail.com",
        sub: uuid.generate(),
        unconfirmed: true
    },
    "requiresNewPassword": {
        username: "requiresNewPassword",
        password: "password",
        email: "requiresnewpassword@mail.com",
        sub: uuid.generate(),
        requiresNewPassword: true
    },
    "smsMfa": {
        username: "smsMfa",
        password: "password",
        email: "smsmfa@mail.com",
        sub: uuid.generate(),
        smsMfa: true
    }
};

var userInfos = {};
var emailedConfirmationCodes = [];

function reset() {
    Object.keys(userInfos).forEach(function (username) {
        delete userInfos[username];
    });
    Object.keys(BASE_USER_INFOS).forEach(function (username) {
        userInfos[username] = Object.assign({}, BASE_USER_INFOS[username]);
    });
    emailedConfirmationCodes.length = 0;
}
reset();

/**
 * @typedef {object} CognitoUserPoolSignUpResult
 * @property {CognitoUser} user
 * @property {boolean} userConfirmed
 * @property {string} userSub
 * @property {CognitoCodeDeliveryDetails} codeDeliveryDetails
 */

/**
 * @typedef {object} CognitoCodeDeliveryDetails
 * @property {string} AttributeName e.g. "email"
 * @property {string} DeliveryMedium e.g. "EMAIL"
 * @property {string} Destination e.g. "a***@g***.com"
 */

function CognitoUser(data) {
    this.username = data.Username || '';
    this.pool = data.Pool;
    this.signInUserSession = null;
    this.authenticationFlowType = 'USER_SRP_AUTH';
}

Object.defineProperties(CognitoUser.prototype, {
    authenticateUser: {
        value: function (authDetails, callback) {
            var username = authDetails.username,
                password = authDetails.password,
                userInfo = userInfos[username];
            if (!userInfo || userInfo.password !== password) {
                callback.onFailure({
                    code: "NotAuthorizedException",
                    name: "NotAuthorizedException",
                    message: "Incorrect username or password."
                });
                return;
            }
            if (userInfo.unconfirmed) {
                callback.onFailure({
                    code: "UserNotConfirmedException",
                    name: "UserNotConfirmedException",
                    message: "User is not confirmed."
                });
                return;
            }
            if (userInfo.smsMfa) {
                userInfo.mfaCode = Math.floor(Math.random() * 1000000);
                callback.mfaRequired("SMS_MFA");
                return;
            }
            if (userInfo.requiresNewPassword) {
                callback.newPasswordRequired({
                    email: userInfo.email
                }, []);
                return;
            }
            this._makeSignInUserSession();
            callback.onSuccess(this.signInUserSession);
        }
    },

    _makeSignInUserSession: {
        value: function () {
            var userInfo = userInfos[this.username];
            this.signInUserSession = {
                idToken: {
                    jwtToken: "abc",
                    payload: {
                        sub: userInfo.sub
                    }
                },
                accessToken: {
                    jwtToken: "abc"
                },
                refreshToken: {
                    jwtToken: "abc"
                }
            };
        }
    },

    confirmRegistration: {
        value: function (confirmationCode, forceAliasCreation, callback, clientMetadata) {
            if (confirmationCode === '123456') {
                userInfos[this.username].unconfirmed = false;
                callback(null, "SUCCESS");
            } else {
                callback({
                    code: "CodeMismatchException",
                    name: "CodeMismatchException",
                    message: "Invalid verification code provided, please try again."
                });
            }
        }
    },

    resendConfirmationCode: {
        value: function (callback) {
            emailedConfirmationCodes.push(this.username);
            callback(null, {
                "AttributeName": "email",
                "DeliveryMedium": "EMAIL",
                "Destination": "n***@m***.com"
            });
        }
    },

    signOut: {
        value: function () {
            this.signInUserSession = null;
        }
    },

    completeNewPasswordChallenge: {
        value: function (newPassword, requiredAttributeData, callback, clientMetadata) {
            var authDetails = {
                username: this.username,
                password: newPassword
            };
            userInfos[this.username].password = newPassword;
            userInfos[this.username].requiresNewPassword = false;
            this.authenticateUser(authDetails, callback);
        }
    },

    sendMFACode: {
        value: function (confirmationCode, callback, mfaType, clientMetadata) {
            var userInfo = userInfos[this.username];
            if (userInfo.mfaCode === confirmationCode) {
                this._makeSignInUserSession();
                callback.onSuccess(this.signInUserSession);
            } else {
                callback.onFailure({
                    code: "CodeMismatchException",
                    name: "CodeMismatchException",
                    message: "Invalid code or auth state for the user."
                });
            }
        }
    },

    getUserData: {
        value: function (callback) {
            var userInfo = userInfos[this.username],
                userData;
            if (!this.signInUserSession) {
                return callback(new Error('not authenticated'));
            }
            userData = {
                UserAttributes: [
                    { Name: "sub", Value: userInfo.sub },
                    { Name: "email", Value: userInfo.email },
                    { Name: "email_confirmed", Value: true }
                ]
            };
            if (userInfo.smsMfa) {
                userData.MFAOptions = [{
                    AttributeName: "phone_number",
                    DeliveryMedium: "SMS"
                }];
            }
            callback(null, userData);
        }
    },

    changePassword: {
        value: function (oldPassword, newPassword, callback, clientMetadata) {
            var userInfo = userInfos[this.username];
            if (!userInfo || userInfo.password !== oldPassword) {
                callback({
                    code: "NotAuthorizedException",
                    name: "NotAuthorizedException",
                    message: "Incorrect password."
                });
                return;
            }
            if (!newPassword || newPassword.length < 6) {
                return callback({
                    code: "InvalidPasswordException",
                    name: "InvalidPasswordException",
                    message: "Password does not conform to policy: Password not long enough"
                });
            }
            userInfo.password = newPassword;
            callback(null, "SUCCESS");
        }
    },

    setUserMfaPreference: {
        value: function (smsMfaSettings, totpMfaSettings, callback) {
            var userInfo = userInfos[this.username];
            userInfo.smsMfa = smsMfaSettings && smsMfaSettings.Enabled;
            callback();
        }
    }
});

function CognitoUserPool(data) {
    data = data || {};
}

Object.defineProperties(CognitoUserPool.prototype, {
    /**
     * @param {nodeCallback<CognitoUserPoolSignUpResult>} callback
     */
    signUp: {
        value: function (username, password, attributeList, validationdata, callback, clientMetadata) {
            var user, emailAttribute, userInfo;
            if (Object.keys(userInfos).indexOf(username) !== -1) {
                return callback({
                    code: "UsernameExistsException",
                    name: "UsernameExistsException",
                    message: "User already exists"
                });
            }
            emailAttribute = attributeList.filter(function (attribute) {
                return attribute.Name === "email"
            })[0];
            if (!emailAttribute) {
                return callback({
                    code: "InvalidParameterException",
                    name: "InvalidParameterException",
                    message: "Attributes did not conform to the schema: email: The attribute is required\n"
                });
            } else if (!emailAttribute.Value || !/.*@.*/.test(emailAttribute.Value)) {
                return callback({
                    code: "InvalidParameterException",
                    name: "InvalidParameterException",
                    message: "Invalid email address format."
                });
            }
            if (!password || password.length < 6) {
                return callback({
                    code: "InvalidParameterException",
                    name: "InvalidParameterException",
                    message: "1 validation error detected: Value at 'password' failed to satisfy constraint: Member must have length greater than or equal to 6"
                });
            }
            user = new CognitoUser({
                Username: username,
                Pool: this
            });
            userInfo = {
                username: username,
                password: password,
                sub: uuid.generate()
            };
            userInfos[username] = userInfo;
            callback(null, {
                user: user,
                userConfirmed: false,
                userSub: userInfo.sub,
                codeDeliveryDetails: {
                    AttributeName: "email",
                    DeliveryMedium: "EMAIL",
                    Destination: "n***@m***.com"
                }
            });
        }
    },

    getCurrentUser: {
        value: function () {
            if (this._lastAuthUser) {
                return new CognitoUser({
                    Username: this._lastAuthUser,
                    Pool: this
                });
            }
            return null;
        }
    }
});

module.exports = {
    CognitoUser: CognitoUser,
    CognitoUserPool: CognitoUserPool,
    userInfos: userInfos,
    emailedConfirmationCodes: emailedConfirmationCodes,
    reset: reset
};