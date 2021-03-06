var crypto = require('crypto');
var fs = require('fs');
window.CLIPBOARDJS = require('clipboard-js');
window.SAML = require('./saml');
const COOKIE_NAME = 'samling';
var meta = fs.readFileSync('./public/metadata.xml.tpl').toString("utf8");

var queryParams = {};

function deleteCookie() {
  document.cookie = COOKIE_NAME + '=' + ';path=/;expires=' + (new Date(1));
}

function logout() {
  if (queryParams["manual"]) {
    delete queryParams["manual"];
    $('#navbarSamling a[href="#userDetailsTab"]').tab('show');
    return;
  }

  var slsUrl = $('#slsUrl').val();
  var slsBindingType = $('#slsBindingType').val();
  var relayState = $('#relayState').val();
  var options = {
    key: $('#signatureKey').val().trim(),
    cert: $('#signatureCert').val().trim()
  };

  if ($('#sendLogout').is(":checked") && slsUrl) {
    options.issuer = $('#issuer').val();
    options.destination = slsUrl;
    options.nameIdentifier = $('#nameIdentifier').val();
    var request = window.SAML.createLogoutRequest(options);
    if (slsBindingType == 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect') {
      window.SAML.signRedirect(request, relayState, options, function(signedParams){
        location.href = slsUrl + '?' + signedParams;
      });
    } else {
      var samlRequest = window.SAML.signDocument(request, "//*[local-name(.)='LogoutRequest']", options);
      var form = $('<form action="' + slsUrl + '" method="post">' +
      '<input type="hidden" name="SAMLRequest" id="samlRequest" value="' + btoa(samlRequest.getSignedXml()) + '" />' +
      '<input type="hidden" name="RelayState" value="' + relayState + '" />' +
      '</form>');
      $('body').append(form);
      form.submit();
    }
    return;
  }

  deleteCookie();
  var response = $('#samlResponse').val();
  if (response && slsUrl) {
    if (slsBindingType == 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect') {
      options.type = 'SAMLResponse';
      $('#samlResponse').val(btoa(response)).val();
      window.SAML.signRedirect(response, relayState, options, function(signedParams){
        location.href = slsUrl + '?' + signedParams;
      });
    } else {
      var samlResponse = window.SAML.signDocument(response, "//*[local-name(.)='LogoutResponse']", options);
      $('#samlResponse').val(btoa(samlResponse.getSignedXml()));
      var form = $('#samlResponseForm')[0];
      form.action = slsUrl;
      form.submit();
    }
  } else {
    location.href = location.href.replace(location.search, '');
  }
}

function handleRequest(request, relayState) {
  // parse the saml request
  window.SAML.parseRequest({issuer: $('#issuer').val().trim(), callbackUrl: $('#callbackUrl').val().trim(), slsUrl: $('#slsUrl').val().trim()}, request, function(info) {
    if (relayState) {
      $('#relayState').val(decodeURIComponent(relayState));
    }

    if (info.logout) {
      $('#samlResponse').val(info.logout.response);
      $('#slsUrl').val(info.logout.callbackUrl);
      $('#callbackUrlReadOnly').val(info.logout.callbackUrl);
      logout();
      return;
    }

    // populate fields from the request
    $('#authnContextClassRef').val(info.login.authnContextClassRef);
    $('#nameIdentifierFormat').val(info.login.nameIdentifierFormat);
    $('#callbackUrl').val(info.login.callbackUrl);
    $('#callbackUrlReadOnly').val(info.login.callbackUrl);
    $('#issuer').val(info.login.destination);
    $('#audience').val(info.login.issuer);
    $('#inResponseTo').val(info.login.id);
    
    // auto-login if:
    // 1. ForceAuthn="true" was not specified on the authentication request
    // 2. we also have the username already populated because of the samling cookie
    if (!info.login.forceAuthn && $('#signedInUser').text().trim().length > 0) {
      $('#createResponse').trigger('click');
      setTimeout(function() {
        $('#postSAMLResponse').trigger('click');
      }, 100);
    }
  });
}

function _getSessionExpiration(format) {
  var sessionDuration = $('#sessionDuration').val().trim();
    if (sessionDuration.length === 0) {
      $('#sessionDurationControl').addClass('has-error');
      !error && $('#sessionDuration').focus();
      error = true;
    } else if (!sessionDuration.match(/^\d+$/)) {
      error && $('#sessionDuration').focus();
      error = true;
    }
  return new Date(Date.now() + parseInt(sessionDuration) * 1000 * 60)["to"+format+"String"]();
}

function _updateMetadata(cert) {
  var flatCert = cert.toString().replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").replace(/[\s]/g, "");
  $('#idpMetadata').text(meta.replace("_CERTIFICATE_", flatCert));
}

$(function() {

  $('[data-toggle="tooltip"]').tooltip();
  $('[data-toggle="popover"]').popover();

  var cert = localStorage.getItem('certVal') || fs.readFileSync('./cert.pem').toString("utf8");
  $('#signatureCert').val(cert);
  $('#signatureKey').val(localStorage.getItem('privateKeyVal') || fs.readFileSync('./key.pem').toString("utf8"));
  _updateMetadata(cert);

  var params = location.search.split('?');
  if (params.length > 1) {
    var parts = params[1].split('&');
    parts.forEach(function(part) {
      var keyval = part.split('=');
      queryParams[keyval[0]] = keyval[1];
    });
  }

  var userControl = $('#signedInUser');
  var cookies = document.cookie.split(';');
  cookies.forEach(function(cook) {
    var parts = cook.split('=');
    if (parts[0].trim() === COOKIE_NAME) {
      try {
        var value = atob(parts[1].trim());
        var data = JSON.parse(value);
        userControl.text('Hello ' + data.nameIdentifier);
        $('#signedInAt').text(data.signedInAt);
        $('#nameIdentifier').val(data.nameIdentifier);
        $('#callbackUrl').val(data.callbackUrl);
        $('#slsUrl').val(data.slsUrl);
        $('#slsBindingType').val(data.slsBindingType);
        $('#callbackUrlReadOnly').val(data.callbackUrl);
        $('#issuer').val(data.issuer);
        $('#authnContextClassRef').val(data.authnContextClassRef);
        $('#nameIdentifierFormat').val(data.nameIdentifierFormat);
        $('#samlAttributes').val(data.attributes);
        $('#inResponseTo').val(data.id);
         } catch (e) {
        $('#signedInAt').text('ERROR: ' + e.message);
      }
    }
  });

  $('#copyMetadata').click(function() {
    window.CLIPBOARDJS.copy($('#idpMetadata').text());
    $('#copyMetadata').tooltip('show');
    setTimeout(function() {
      $('#copyMetadata').tooltip('hide');
    }, 1500);
  });

  $('#copyResponseToClipboard').click(function() {
    window.CLIPBOARDJS.copy($('#samlResponse').val());
    $('#copyResponseToClipboard').tooltip('show');
    setTimeout(function() {
      $('#copyResponseToClipboard').tooltip('hide');
    }, 1500);
  });

  $('#signedInLogout').click(function() {
    $('#slsUrlControl').removeClass('has-error');

    if ($('#sendLogout').is(":checked") && $('#slsUrl').val().trim().length === 0) {
      $('#navbarSamling a[href="#samlPropertiesTab"]').tab('show')
      $('#slsUrlControl').addClass('has-error');
      $('#slsUrl').focus();
      return;
    }

    logout();
  });

  $('#generateKeyAndCert').click(function() {
    var pki = window.forge.pki;
    var keypair = pki.rsa.generateKeyPair({bits: 1024});
    var cert = pki.createCertificate();
    cert.publicKey = keypair.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    var attrs = [{
      name: 'commonName',
      value: 'capriza.com'
    }, {
      name: 'countryName',
      value: 'US'
    }, {
      shortName: 'ST',
      value: 'Virginia'
    }, {
      name: 'localityName',
      value: 'Blacksburg'
    }, {
      name: 'organizationName',
      value: 'Samling'
    }, {
      shortName: 'OU',
      value: 'Samling'
    }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([{
      name: 'basicConstraints',
      cA: true
    }, {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true
    }, {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true
    }, {
      name: 'subjectAltName',
      altNames: [{
        type: 6, // URI
        value: 'http://capriza.com/samling'
      }]
    }, {
      name: 'subjectKeyIdentifier'
    }]);
    // self-sign certificate
    cert.sign(keypair.privateKey);
    // convert to PEM
    var certVal = pki.certificateToPem(cert);
    var privateKeyVal = pki.privateKeyToPem(keypair.privateKey);
    $('#signatureCert').val(certVal);
    $('#signatureKey').val(privateKeyVal);
  });

  $('#saveKeyAndCert').click(function() {
    var cert = $('#signatureCert').val().trim();
    localStorage.setItem('certVal', cert);
    localStorage.setItem('privateKeyVal', $('#signatureKey').val().trim());
    _updateMetadata(cert);
  });

  $('#createResponse').click(function() {
    $('#nameIdentifierControl').removeClass('has-error');
    $('#callbackUrlControl').removeClass('has-error');
    $('#signatureKeyControl').removeClass('has-error');
    $('#signatureCertControl').removeClass('has-error');

    var error = false;
    if ($('#nameIdentifier').val().trim().length === 0) {
      $('#nameIdentifierControl').addClass('has-error');
      !error && $('#nameIdentifier').focus();
      error = true;
    }

    if ($('#callbackUrl').val().trim().length === 0) {
      $('#callbackUrlControl').addClass('has-error');
      !error && $('#callbackUrl').focus();
      error = true;
    }

    if ($('#signatureKey').val().trim().length === 0) {
      $('#signatureKeyControl').addClass('has-error');
      !error && $('#signatureKey').focus();
      error = true;
    }

    if ($('#signatureCert').val().trim().length === 0) {
      $('#signatureCertControl').addClass('has-error');
      !error && $('#signatureCert').focus();
      error = true;
    }

    if (error) {
      return;
    }

    var attributes = undefined;
    var attributesStr = $('#samlAttributes').val().trim();
    if (attributesStr.length > 0) {
      attributes = {};
      attributesStr.split('\n').forEach(function(line) {
        var line = line.split('=');
        var name = line.shift().trim();
        if (name.length > 0) {
          var value = line.join('=').trim();
          if (attributes[name]) {
            attributes[name].push(value);
          } else {
            attributes[name] = [value];
          }
        }
      });
    }

    var options = {
      key: $('#signatureKey').val().trim(),
      cert: $('#signatureCert').val().trim(),
      issuer: $('#issuer').val().trim(),
      recipient: $('#callbackUrl').val().trim(),
      audiences: $('#audience').val().trim(),
      inResponseTo: $('#inResponseTo').val().trim(),
      authnContextClassRef: $('#authnContextClassRef').val().trim(),
      nameIdentifierFormat: $('#nameIdentifierFormat').val().trim(),
      nameQualifierFormat: $('#nameQualifierFormat').val().trim(),
      nameIdentifier: $('#nameIdentifier').val().trim(),
      sessionExpiration: _getSessionExpiration("ISO"),
      sessionIndex: ('_samling_' + (Math.random() * 10000000)).replace('.', '_'),
      lifetimeInSeconds: $('#lifetimeInSeconds').val().trim(),
      attributes: attributes
    };
    var assertion = window.SAML.createAssertion(options);
    var callbackUrl = $('#callbackUrl').val().trim();
    var response = window.SAML.createResponse({
      instant: new Date().toISOString().trim(),
      issuer: $('#issuer').val().trim(),
      inResponseTo: $('#inResponseTo').val().trim(),
      destination: callbackUrl,
      assertion: assertion,
      samlStatusCode: $('#samlStatusCode').val().trim(),
      samlStatusMessage: $('#samlStatusMessage').val().trim(),
      signResponse: $('#signResponse').is(":checked") ? options : undefined,
    });
    
    $('#samlResponse').val(response);
    $('#callbackUrlReadOnly').val(callbackUrl);
    $('#navbarSamling a[href="#samlResponseTab"]').tab('show')
  });

  $('#postSAMLResponse').click(function(event) {
    event.preventDefault();
    $('#samlResponseControl').removeClass('has-error');
    $('#sessionDurationControl').removeClass('has-error');
    $('#callbackUrlControl').removeClass('has-error');

    var error = false;

    var samlResponse = $('#samlResponse').val().trim();
    if (samlResponse.length === 0) {
      $('#samlResponseControl').addClass('has-error');
      !error && $('#samlResponse').focus();
      error = true;
    }
    $('#samlResponse').val(btoa(samlResponse));

    var callbackUrl = $('#callbackUrl').val().trim();
    if (callbackUrl.length === 0) {
      $('#callbackUrlControl').addClass('has-error');
      !error && $('#callbackUrl').focus();
      error = true;
    }

    if (error) {
      return;
    }

    // write the "login" cookie
    var cookieData = {
      signedInAt: new Date().toUTCString(),
      nameIdentifier: $('#nameIdentifier').val().trim(),
      callbackUrl: $('#callbackUrl').val().trim(),
      slsUrl: $('#slsUrl').val().trim(),
      slsBindingType: $('#slsBindingType').val(),
      issuer: $('#issuer').val().trim(),
      authnContextClassRef: $('#authnContextClassRef').val().trim(),
      nameIdentifierFormat: $('#nameIdentifierFormat').val().trim(),
      attributes: $('#samlAttributes').val().trim()
    };
    var cookieValue = btoa(JSON.stringify(cookieData));
    deleteCookie();
    document.cookie = COOKIE_NAME + '=' + cookieValue + ';path=/;expires=' + _getSessionExpiration("UTC");

    var form = $('#samlResponseForm')[0];
    form.action = callbackUrl;
    form.submit();
  });

  if (queryParams['SAMLRequest']) {
    handleRequest(queryParams['SAMLRequest'], queryParams['RelayState']);
  }

  if (queryParams['SAMLResponse']) {
    logout();
  }
});

