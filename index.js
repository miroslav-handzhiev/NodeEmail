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
    let timeout = 50000;
    console.log(body);
    sfUsername = body.sfUser;
    sfPassword = body.sfPass;
    searchDateString = body.searchDateString;
    var imap = new Imap({
        user: body.user,
        password: body.pass,
        host: body.server,
        port: body.port,
        tls: body.tls,
        connTimeout : timeout,
        authTimeout : timeout,
        socketTimeout : timeout

      });
    
      function openInbox(cb) {
        imap.openBox('INBOX', true, cb);
      }
      
      imap.once('ready', function() {
        openInbox(function(err, box) {
          if (err) throw err;
          console.log(box.messages.total + ' message(s) found!');
          // 1:* - Retrieve all messages
          imap.search([ 'ALL', ['SINCE', searchDateString] ], function(err, results) {
          var f = imap.fetch(results, {bodies: ''});

          /*var f = imap.seq.fetch('1:*', {
            bodies: ''
          });*/
          f.on('message', function(msg, seqno) {
            //console.log('Message #%d', seqno);
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
      
      sfConn.bulk.pollInterval = 5000; // 5 sec
      sfConn.bulk.pollTimeout = 60000; // 60 sec

      sfConn.login(sfUsername, sfPassword, function(err,userInfo) {
        if (err) { 
          return console.error(err); 
        }
        
        let sfMailArray = [];
        //let sfMailIds = [];
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
          //sfMailIds.push(mail.messageId);
          if(mail.messageId) sfMailArray.push(sfMail);
        });
        console.log("sfMailArray: ");
        console.log(sfMailArray.length);
        let successMailIds = []; 
        var job = sfConn.bulk.createJob("Email__c", "upsert",{extIdField:"MessageId__c"});
        var batch = job.createBatch();
        // start job
        batch.execute(sfMailArray);
        // listen for events
        batch.on("error", function(batchInfo) { // fired when batch request is queued in server.
          console.log('Error, batchInfo:', batchInfo);
              });
        batch.on("queue", function(batchInfo) { // fired when batch request is queued in server.
          console.log('queue, batchInfo:', batchInfo);
          batch.poll(5000 /* interval(ms) */, 50000 /* timeout(ms) */); // start polling - Do not poll until the batch has started
            });
        batch.on("response", function(rets) { // fired when batch finished and result retrieved
                for (var i=0; i < rets.length; i++) {
                  if (rets[i].success) {
              //console.log("#" + (i+1) + " success = " + rets[i].id);
              successMailIds.push(rets[i].id);
              emailArray[i].id = rets[i].id;
            } else {
              console.log("#" + (i+1) + " error occurred, message = " + rets[i].errors.join(', '));
                  }
                }
            });
        });
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

app.post('/getUserAttachments',jsonParser, (req, res) => {
    sfConn.sobject("Email__c") .find({ CreatedDate: sf.Date.TODAY }, 'Id,MessageId__c') // fields in asterisk, means wildcard.
          .execute(function(err, records) {
            console.log("Name : " + records[i].MessageId__c);
          });
          /*
          sfConn.sobject("Email__c").retrieve(successMailIds, function(err, records) {
        if (err) { return console.error(err); }
            for (var i=0; i < records.length; i++) {
              console.log("Name : " + records[i].MessageId__c);
            }
        // ...
      });
          // ...
          let sfAttachmentArray = [];
          emailArray.forEach((mail) => {
            mail.attachments.forEach((att) => {
              console.log(att.filename + mail.id);
              let sfAttachment = {};
              sfAttachment.ParentId = mail.id;
              let base64data = new Buffer.from(att.content, 'binary').toString('base64');
              sfAttachment.Body = base64data;
              sfAttachment.contentType = att.contentType;
              sfAttachment.Name = att.filename;
              if(mail.id){
                sfAttachmentArray.push(sfAttachment);
    }
  });
          });
          
        console.log("Attachment: ");
        console.log(sfAttachmentArray.length);

        var i,j, temporary, chunk = 30;
        for (i = 0,j = sfAttachmentArray.length; i < j; i += chunk) {
            temporary = sfAttachmentArray.slice(i, i + chunk);
            // do whatever
            let job2 = sfConn.bulk.createJob("Attachment", "insert");
            let batch2 = job2.createBatch();
            batch2.execute(temporary);
        }*/
});