var express = require("express");
var app = express();
var bodyParser = require('body-parser');
var compression = require('compression');
var sf = require('node-salesforce');
var sfConn = new sf.Connection({
  // you can change loginUrl to connect to sandbox or prerelease env.
  //loginUrl : "https://login.salesforce.com"
});
//const router = express.Router();
// trust all certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var server_port = process.env.YOUR_PORT || process.env.PORT || 8000;
var server_host = process.env.YOUR_HOST || '0.0.0.0';
var server = app.listen(server_port, server_host, function() {
    console.log('Listening on port %d', server_port);
});

server.setTimeout(500000);
app.use(compression({ level: 8 }));

// create application/json parser
var jsonParser = bodyParser.json()
// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })
var sfUsername;
var sfPassword;

var Imap = require('imap'), inspect = require('util').inspect;
var fs = require('fs');
const simpleParser = require('mailparser').simpleParser;

app.post('/getUserEmails',jsonParser, (req, res) => {
    let emailArray = [];
    let result = {};
    let body = req.body;
    console.log(body);
    sfUsername = body.sfUser;
    sfPassword = body.sfPass;
    var imap = new Imap({
        user: body.user,
        password: body.pass,
        host: body.server,
        port: body.port,
        tls: body.tls
      });
    
      function openInbox(cb) {
        imap.openBox('INBOX', true, cb);
      }
      
      imap.once('ready', function() {
        openInbox(function(err, box) {
          if (err) throw err;
          console.log(box.messages.total + ' message(s) found!');
          // 1:* - Retrieve all messages
          var f = imap.seq.fetch('1:*', {
            bodies: ''
          });
          f.on('message', function(msg, seqno) {
            console.log('Message #%d', seqno);
            msg.on('body', function(stream, info) {
              // use a specialized mail parsing library (https://github.com/andris9/mailparser)
              simpleParser(stream, (err, mail) => {
                emailArray.push(new Email(mail.from, mail.to, mail.cc, mail.bcc,
                    mail.date, mail.subject, mail.html, mail.text, mail.messageId, mail.inReplyTo,
                  //  ''));
                     mail.attachments));
              });
            });
          });
          f.once('error', function(err) {
            console.log('Fetch error: ' + err);
          });
          f.once('end', function() {
            console.log('Done fetching all messages!');
            imap.end();
            sfUpsertMail();
          });
        });
      });
      
      imap.once('error', function(err) {
        console.log(err);
      });
      
      imap.once('end', function() {
        console.log('Connection ended');
        
        
        res.send('Ok');
      });
      
      imap.connect();
    
    function sfUpsertMail(){
      sfConn.login(sfUsername, sfPassword, function(err,userInfo) {
        if (err) { 
          return console.error(err); 
        }
        
        let sfMailArray = [];
        let sfMailIds = [];
        emailArray.forEach((mail) => {
          let sfMail = {};
          sfMail.From__c = mail.From.text;
          sfMail.To__c = mail.To.text;
          sfMail.CcAddress__c = mail.cc;
          sfMail.BccAddress__c = mail.Bcc;
          sfMail.MessageDate__c = mail.MessageDate;
          sfMail.Subject__c = mail.Subject;
          sfMail.HtmlBody__c = mail.Html;
          sfMail.TextBody__c = mail.Text;
          sfMail.MessageId__c = mail.messageId;
          sfMail.RelatedToId__c = mail.inReplyTo;
          //sfMail.Attachments = mail.attachments;
          sfMailIds.push(mail.messageId);
          sfMailArray.push(sfMail);
        });
        //sfConn.sobject("Email__c").upsert(sfMailArray, 'MessageId__c',
        sfConn.sobject("Email__c").create(sfMailArray,
          function(err, rets) {
            if (err) { 
              return console.error(err); 
            }
            for (var i=0; i < rets.length; i++) {
              if (rets[i].success) {
                console.log("Upserted Successfully");
                console.log(rets[i]);
                if(rets[i].id){
                  emailArray[i].id = rets[i].id;
                }
              }
            }
            
            let sfAttachmentArray = [];
            emailArray.forEach((mail) => {
              mail.attachments.forEach((att) => {
                console.log(att.filename);
                console.log(mail.id);
                let sfAttachment = {};
                sfAttachment.ParentId = mail.id;
                let base64data = new Buffer.from(att.content, 'binary').toString('base64');
                
                //let base64data = new Buffer.from('Text1234').toString('base64');
                sfAttachment.Body = base64data;
                sfAttachment.contentType = att.contentType;
                sfAttachment.Name = att.filename;
                
                sfAttachmentArray.push(sfAttachment);
              });
            });
            
            sfConn.sobject('Attachment').create(sfAttachmentArray, 
              function(err, rets) {
                console.log('return:');
                if (err) { 
                  return console.error(err); 
                }
                for (var i=0; i < rets.length; i++) {
                  if (rets[i].success) {
                    console.log("Upserted Successfully");
                    console.log(rets[i]);
                  }
                }
            });
          /* needed if upsert
           sfConn.sobject("Email__c")
            .find(
              // conditions in JSON object
              {MessageId__c : { $in : sfMailIds }},
              // fields in JSON object
              { Id: 1 , MessageId__c: 1 }
            )
            .execute(function(err, records) {
              if (err) { return console.error(err); }
              console.log("fetched : " + records.length);
              console.log("fetched : " + JSON.stringify(records));

            });*/
            /*
            sfConn.sobject("Email__c").retrieve(sfMailIds, function(err, emails) {
              if (err) { return console.error(err); }
              for (var i=0; i < emails.length; i++) {
                console.log("emails : " + JSON.stringify(emails[i]));
              }
              // ...
            });*/
        });
        
    });
      /*
      emailArray.forEach((mail) => {
        let sfAttachmentMap = new Map();
        mail.attachments.forEach((att) => {
          let sfAttachment = {};
          sfAttachment.ParentId = mail.messageId;
          let base64data = new Buffer.alloc(att).toString('base64');
          sfAttachment.Body = base64data;
          sfAttachmentMap.set(mail.messageId,sfAttachment);
        });
      });*/
      /*
      let body = {};
      body.emails = emailArray;
      console.log(body);
      sfConn.apex.post("/InsertEmail/", body, function(res) {
        console.log(res);
        // the response object structure depends on the definition of apex class
      });*/
/*
      sfConn.sobject('Attachment').create(sfAttachmentArray, 
        function(err, uploadedAttachment) {
            console.log(err,uploadedAttachment);
      });
    
    });*/
  }
});
class Email {
    constructor(From, To, Cc, Bcc, Date, Subject, Html, Text, messageId, inReplyTo, attachments) {
      this.From = From;
      this.To = To;
      this.Cc = Cc;
      this.Bcc = Bcc;
      this.MessageDate = Date;
      this.Subject = Subject;
      this.Html = Html;
      this.Text = Text;
      this.messageId = messageId;
      this.inReplyTo = inReplyTo;
      this.attachments = attachments;
    }
  }


  app.post('/sfLogin',jsonParser, (req, res) => {
    let body = req.body;
    console.log(body);
    sfUsername = body.sfUser;
    sfPassword = body.sfPass;
    console.log(sfUsername);
    sfLogin();
    function sfLogin(){
      sfConn.login(sfUsername, sfPassword, function(err, userInfo) {
        if (err) { return console.error(err); }
        // Now you can get the access token and instance URL information.
        // Save them to establish connection next time.
        console.log(conn.accessToken);
        console.log(conn.instanceUrl);
        // logged in user property
        console.log("User ID: " + userInfo.id);
        console.log("Org ID: " + userInfo.organizationId);
        res.send(conn.accessToken);
        // ...
      });
    }
  });