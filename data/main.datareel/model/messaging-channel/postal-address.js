var Object = require("../object").Object;

/**
 * @class Address
 * @extends Object
 */

 /*
    from https://tools.ietf.org/id/draft-stepanek-jscontact-00.html#rfc.section.1.2

    An Address object has the following properties:

type: String Specifies the context of the address information. This MUST be taken from the set of values allowed (see above).
    -> Types are:
"home" An address of a residence associated with the person.
"work" An address of a workplace associated with the person.
"billing" An address to be used with billing associated with the person.
"postal" An address to be used for delivering physical items to the person.
"other" An address not covered by the above categories.

label: String (optional) A label describing the value in more detail, especially if type === "other" (but MAY be included with any type).

street: String (optional) The street address. This MAY be multiple lines; newlines MUST be preserved.
locality: String (optional) The city, town, village, post town, or other locality within which the street address may be found.
region: String (optional) The province, such as a state, county, or canton within which the locality may be found.
postcode: String (optional) The postal code, post code, ZIP code or other short code associated with the address by the relevant country's postal system.
country: String (optional) The country name.
isDefault: Boolean (optional, default: false) Whether this Address is the default for its type. This SHOULD only be one per type.

*/


exports.PostalAddress = Object.specialize(/** @lends Address.prototype */ {

    name: {
        value: undefined
    },
    firstName: {
        value: undefined
    },
    lastName: {
        value: undefined
    },
    phone: {
        value: undefined
    },
    company: {
        value: undefined
    },
    address1: {
        value: undefined
    },
    address2: {
        value: undefined
    },
    city: {
        value: undefined
    },
    provinceCode: {
        value: undefined
    },
    zip: {
        value: undefined
    },
    country: {
        value: undefined
    },

    /**
     * The geographic position of the address, as a
     *
     *  "montage-geo/logic/model/descriptors/geometry.mjson"
     *     *
     * @property {Geometry}
     */

    location: {
        value: undefined
    }
});
