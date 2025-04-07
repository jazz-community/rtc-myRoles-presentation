/**
 * @Author Lukas Steiger
 * @Copyright (c) 2017, Siemens AG
 */
define([
	"dojo/_base/declare",
	"./XhrHelpers"
], function (declare, XHR) {
	var JazzHelpers = declare("com.siemens.bt.jazz.uitls.jazz", null, {

		/**
		 * get the base URL for all application interactions for the current application
		 * @returns {string} base URI of the application, e.g. https://my-jazz-server.com/CCM
		 */
		getApplicationBaseUrl: function () {
			/* globals net: false */
			var baseUrl = net.jazz.ajax.BootstrapProperties.FRONTSIDE_URL;
			baseUrl = this._addTrailingSlashIfNotPresent(baseUrl);
			return (typeof baseUrl !== "undefined" && baseUrl.length > 0) ? baseUrl : null;
		},

		/*********************************************
		 *********** private helpers *****************
		 *********************************************/
		/* PRIVATE: adds a trailing slash where needed */
		_addTrailingSlashIfNotPresent: function (url) {
			if (url.charAt(url.length - 1) !== "/") {
				url += "/";
			}
			return url;
		},
		/**
		 * get the url pointing to the process definition of the passed in team area
		 * @params projectAreaUUID: the UUID of the project area where the passed in team area lives in
		 * @params teamAreaUUID: the team area (UUID) for which we need the resource URI
		 * @returns {string} the team area process definition URI
		 */
		getProcessTeamAreaUrl: function (projectAreaUUID, teamAreaUUID) {
			var url = this.getApplicationBaseUrl() + "process/project-areas/" + projectAreaUUID;
			return projectAreaUUID === teamAreaUUID ? url : url + "/team-areas/" + teamAreaUUID;
		},

		/**
		 * find out whether the user has sufficient permission to execute an operation in jazz
		 * the real security check is made server side, this is only for client side user experience improvements (fast fail)
		 * @params {string} operation: identifies the operation to be executed, e.g. com.ibm.team.workitem.operation.workItemSave
		 * @params {string} teamAreaContext: the team area process URI, as returned by @reference: getProcessTeamAreaUrl()
		 * @params (optional) {string|array} actions: the exact action(s) to be executed, e.g. create/type/defect
		 * @returns {promise} returns an XML document of the following format:
		 * <?xml version="1.0" encoding="UTF-8" standalone="no"?>
		 * <jp06:operation-report xmlns:jp06="http://jazz.net/xmlns/prod/jazz/process/0.6/" jp06:overallStatus="OK">
		 *   <jp06:license-info jp06:granted="true"/>
		 *   <jp06:action-permissions>
		 *     <jp06:action
		 *           jp06:actionId="create/type/defect"
		 *           jp06:allowed="true"/>
		 *   </jp06:action-permissions>
		 *   <jp06:preconditions>
		 *     ...
		 *   </jp06:preconditions>
		 * </jp06:operation-report>
		 */
		isOperationAllowed: function (operation, teamAreaContext, actions) {
			var url = this.getApplicationBaseUrl() + "process-security/operation-reports" +
				"?operationId=" + operation +
				"&context=" + teamAreaContext;
			if (typeof actions === "string") {
				url += "&action=" + actions;
			} else if (typeof actions !== "undefined" && actions.length && actions.length > 0) {
				for (var i = 0; i < actions.length; i++) {
					url += "&action=" + actions[i];
				}
			}
			return XHR.oslcXmlGetRequest(url);
		},

		getValueFromPresentationProperties: function (key, presentation) {
			var defaultValue = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : undefined;

			if (!presentation || !presentation.properties) {
				return defaultValue;
			}

			for (var i = 0; i < presentation.properties.length; i++) {
				var element = presentation.properties[i];
				if (element.key === key) {
					return element.value;
				}
			}

			return defaultValue;
		},
	});
	// create singleton
	return new JazzHelpers();
});
