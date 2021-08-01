var express = require("express");
var app = express();
var bodyParser = require('body-parser')
//const router = express.Router();
// trust all certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var server_port = process.env.YOUR_PORT || process.env.PORT || 8000;
var server_host = process.env.YOUR_HOST || '0.0.0.0';
app.listen(server_port, server_host, function() {
    console.log('Listening on port %d', server_port);
});


// create application/json parser
var jsonParser = bodyParser.json()
// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })


var Imap = require('imap'), inspect = require('util').inspect;
var fs = require('fs');
const simpleParser = require('mailparser').simpleParser;

app.post('/getUserEmails',urlencodedParser, (req, res) => {
    let emailArray = [];
    let result = {};
    let body = req.body;
    console.log(body);
    var imap = new Imap({
        user: body.user,
        password: body.pass,
        host: body.server,
        port: body.port,
        tls: body.tls
      });

      function openInbox(cb) {
        console.log(imap.getBoxes());
        imap.openBox('INBOX', true, cb);
      }
      
      imap.once('ready', function() {
        openInbox(function(err, box) {
          if (err) throw err;
          console.log(box.messages.total + ' message(s) found!');
          console.log(box.messages);
          // 1:* - Retrieve all messages
          var f = imap.seq.fetch('1:*', {
            bodies: ''
          });
          f.on('message', function(msg, seqno) {
            console.log('Message #%d', seqno);
            msg.on('body', function(stream, info) {
              // use a specialized mail parsing library (https://github.com/andris9/mailparser)
              simpleParser(stream, (err, mail) => {
                console.log(mail);
                //console.log(prefix + mail.subject);
                emailArray.push(new Email(mail.from, mail.to, mail.cc, mail.bcc,
                    mail.date, mail.subject, mail.html, mail.text, mail.messageId, mail.inReplyTo, mail.attachments));
              });
            });
          });
          f.once('error', function(err) {
            console.log('Fetch error: ' + err);
          });
          f.once('end', function() {
            console.log('Done fetching all messages!');
            imap.end();
          });
        });
      });
      
      imap.once('error', function(err) {
        console.log(err);
      });
      
      imap.once('end', function() {
        console.log('Connection ended');
        res.send(emailArray);        
      });
      
      imap.connect();

      
});
class Email {
    constructor(From, To, Cc, Bcc, Date, Subject, Html, Text, messageId, inReplyTo, attachments) {
      this.From = From;
      this.To = To;
      this.Cc = Cc;
      this.Bcc = Bcc;
      this.Date = Date;
      this.Subject = Subject;
      this.Html = Html;
      this.Text = Text;
      this.messageId = messageId;
      this.inReplyTo = inReplyTo;
      this.attachments = attachments;
    }
  }