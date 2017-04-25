

'use strict'

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const token = process.env.token;
var http = require("http");
var total_usage = 0;
var total_questions_asked = 0;
var total_questions_answered = 0;
 
// NOTE ABOUT THE FOLLOWING FUNCTION:
// - I am using a free heroku app, which 'sleeps' every hour if it is not pinged
// - When someone pings it after this hour, it starts up again with a different IP address
// - Some IP addresses are blacklisted from FB, which causes my app to crash
// - By pinging it every 30 minutes, it will never sleep and the IP address will never
//   change to a blacklisted one
setInterval(function() {
    http.get("http://rocky-inlet-35580.herokuapp.com");
}, 1800000); // 30 minutes

var questions = [];
var users = [];


var initialQuestions = ["How are you doing today?", "What makes you an interesting person?", "What is your current goal?", "What is your favorite type of cookie?", "What is your favorite TV show?", "Funniest thing that happened to you today?", "Where are you?", "What happens to us when we die?", "How old are you?", "Pancakes or waffles?", "What time is it for you?", "What should I eat for dinner?", "What is your middle name?", "Favorite band or musician?", "What is your favorite color?", "Funniest thing that happened to you this week?", "Best childhood memory?", "Would you rather be gossiped about or never talked about at all?", "Favorite school?", "Would you rather end hunger or hatred?"];

if(total_usage == 0) {
 	for(var i = 0; i < initialQuestions.length; i++) {
		userAsking(null, users, null, questions, initialQuestions[i]);
 	}
}

app.set('port', (process.env.PORT || 5000));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}));

// Process application/json
app.use(bodyParser.json());

// Index route
app.get('/', function (req, res) {
	res.send('Hello world, I am a chat bot');
});

// for Facebook verification
app.get('/webhook/', function (req, res) {
	if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
		res.send(req.query['hub.challenge']);
	}
	res.send('Error, wrong token');
});

// Spin up the server
app.listen(app.get('port'), function() {
	console.log('running on port', app.get('port'));
});

app.post('/webhook/', function (req, res) {
    let messaging_events = req.body.entry[0].messaging
    var current_user;
    var current_answerer;
    var text;
    var original_message;
    var found = false;
    var user_state;
    for (let i = 0; i < messaging_events.length; i++) {
	    let event = req.body.entry[0].messaging[i];
	    let sender = event.sender.id;
	    if (event.postback && event.postback.payload == "GET_STARTED_PAYLOAD") {
	    	sendTextMessage(sender, "Welcome! I will help you ask and answer questions with anyone around the world. How does that sound? :)");
	    }
	    if (event.message && event.message.text) {
	  
			usageInfo();
	    	
	    	// Find the current user
	    	current_user = users[sender]
	    	found = sender in users;
	    	if(found) {
	    		user_state = current_user.state;
	    	}

	    	text = event.message.text;
	    	original_message = sanitizeInput(text);
	    	text = text.toLowerCase();
	    	
	    	// New User
	    	if (!found) {
	    		promptUser(sender, users);
	    	} else if(found && user_state == "prompted" && text != "ask" && text != "answer") {
	    		sendTextMessage(sender, "If you want to answer a question, you must type 'answer'. \n \n If you want to ask a question, you must type 'ask'");
	    	}
	    	// User has requested to answer a question and is now answering
	    	else if (found && user_state == "answering") {
	    		userAnswering(sender, users, questions, original_message);
	    	}  
	    	// User has requested to ask a question and is now asking
	    	else if (found && user_state == "asking") {
	    		userAsking(sender, users, questions, original_message);
	    	} 
	    	// User has typed 'ask' or some variation of that
	    	else if (found && text.includes("ask") && user_state == "prompted"){
	    		userWantsToAsk(sender, users);
	    	} 
		    // If a user somehow gets here, treat them as new and ask them to ask or answer again
		    else if (found && text.includes("answer") && user_state == "prompted") {
	    		giveUserQuestion(sender, users, questions);
	    	} else if (found) {
	    		promptUser(sender, users);
	    	}
	    	else {
		    	console.log("reached the end");
		    }
	    }
    }
    res.sendStatus(200)
});

function sendTextMessage(sender, text) {

    let messageData = { text:text }
    request({
	    url: 'https://graph.facebook.com/v2.9/me/messages',
	    qs: {access_token:token},
	    method: 'POST',
		json: {
		    recipient: {id:sender},
			message: messageData,
		}
	}, function(error, response, body) {
		if (error) {
		    console.log('Error sending messages: ', error)
		} else if (response.body.error) {
		    console.log('Error: ', response.body.error)
	    }
    });
}

// Asks user if they want to answer a question
// Creates a new user
function promptUser(sender, users) {
	sendTextMessage(sender, "Do you want to ask or answer a question?");
	setPrompt(sender, users);
	//users.push({person: sender, answerer: null, state: "prompted"});
}


//Gives the user a question to answer
function giveUserQuestion(sender, users, questions) {
	// If there are no questions waiting to be answered
	if(!questions[0]) {
		sendTextMessage(sender, "No questions right now. Sorry!");
		setPrompt(sender, users);
	} else { // If there is a question 
		var index;
		for(index = 0; index < questions.length; index++) {
			if (questions[index].asker != sender) {
		 		break;
			} 
		}
		if (questions[index] == null || questions[index].question == null) {
	 		sendTextMessage(sender, "No questions right now. Sorry!");
	 		setPrompt(sender, users);
		} else {
			var question = questions[index].question;
			users[sender].state = "answering";
			questions[index].answerer = sender;
			sendTextMessage(sender, "Please answer the following question: \n\n" + question);
		}
	}
}

// Handles when a user answers a question
function userAnswering(sender, users, questions, original_message) {
	
	// Just for my curiousity
	total_questions_answered++;
	
	var index;
	for (index = 0; index < questions.length; index++) {
		if (questions[index].answerer == sender) {
			// Without a subscription, the bot will get banned if it messages users after 24 hours
			// of interaction. If we find a question that is 24 hours old, it must be removed.
			var cur_date = new Date();
			var question_date = questions[index].date;
			if ((Math.abs(cur_date - question_date) / 36e5) >= 23.5) { // 36e5 helps convert milliseconds to hours
				questions.splice(index, 1); // remove the question
				continue;
			} else {
				break;
			}
		}
	}
	// Send message to the asker with an answer
	// It would equal null if it is a repeat question. 
	if(questions[index] && questions[index].completed == false) {
		sendTextMessage(questions[index].asker, "You asked: " + questions[index].question + "\n \nThe answer is: " + original_message);
		questions[index].completed = true;
	}
	// Confirm that your answer was sent.
	sendTextMessage(sender, "I just sent your answer to the asker. Thanks!");
	promptUser(sender, users);

	var popped_question = questions.splice(index, 1); // Remove question from the array
	popped_question[0].answerer = null;
	questions.push(popped_question[0]);
}

// Handles when a user wants to ask a question
function userWantsToAsk(sender, users) {
	sendTextMessage(sender, "Please ask your question.");
	users[sender].state = "asking";
}

// handles when a user asks a question
function userAsking(sender, users, questions, original_message) {
	
	// Just for my curiousity
	total_questions_asked++;

	var cur_date = new Date();
	
	if (original_message.slice(-1) != '?') {
		original_message = original_message + "?"; 
	}
	// If a user tries to send a link, change the question to a harmless, common one
	if(original_message.includes(".com") || original_message.includes("www") || original_message.includes(".co")) {
			sendTextMessage(sender, "Sorry. Please do not send links");
			promptUser(sender, users);
			return;
	}
	questions.unshift({question: original_message, asker: sender, answerer: null, date: cur_date, completed: false});
	sendTextMessage(sender, "Thanks, I will get back to you shortly.");
	setPrompt(sender, users);
}

function setPrompt(sender, users) {
	users[sender] = {answerer: null, state: "prompted"};

	// for (var i = 0; i < users.length; i++) {
	// 	if (users[i].person == sender) {
	// 		users.splice(i, 1);
	// 	}
	// }
	// users.push({person: sender, answerer: null, state: "prompted"});
}

// Keep track of total questions asked and answered
function usageInfo() {
	total_usage++;
	console.log("Total Usage = +" + total_usage);
	console.log("Questions Asked = " + total_questions_asked);
	console.log("Questions Answered = " + total_questions_answered);  
	
}

function sanitizeInput(text) {
	text = text.replace(/[*{}><]/g,""); // Sanitize string 
	return text;
}