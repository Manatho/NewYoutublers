var DB = require('./database.js');
var HtmlPreprocessor = require('./html-preprocessor.js');

var http = require('http');
var fs = require('fs');
var sha = require('sha1');

const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const session = require('express-session');

const app = express();
app.use(bodyParser.urlencoded({ extended: true}));
app.use(express.static(__dirname + '/public'));
app.use(fileUpload());
app.use(session({secret: "Hello", resave: false, saveUninitialized: false}));

DB.initialize();


// --- Home ---

app.get('/', (req, res) => {
    res.redirect("/home");
});

app.get('/home', (req, res) => {
    res.send( showPage('./pages/home.html', {
        searchTitle: 'Most viewed',
        videos: DB.videos(),
        user: getUser(req) != undefined
    }))
});

// --- search ---

app.get('/results', (req, res) => {
    res.send( showPage('./pages/search.html', {
        searchTitle: 'Search results',
        videos: DB.videosByTitle(req.query['search']),
        user: getUser(req) != undefined

    }))
});

// --- Videos ---

app.get('/watch', (req, res) => {

    if (req.query['v'] == undefined) 
        res.sendStatus(404);;

    var video = DB.videoByID(req.query.v);
    var comments = DB.comments(req.query.v);
    var rating = DB.rating(req.query.v).total;

    if(typeof(rating) != 'number') rating = 0;

    if(video != undefined){
        res.send(
            showPage('./pages/watch.html', {
                video: video,
                comments: comments,
                rating: rating,
                user: getUser(req) != undefined
            })
        )
    }
    else
    res.sendStatus(404);
});

app.post('/comment', (req, res) => {

    if(!userLoggedIn(req)) 
        return res.send( JSON.stringify({status: 'unauthenticated'}));

    var video = DB.videoByID(req.body.video);
    var comment = req.body.comment;
    
    if(video == undefined || comment == undefined || comment.length > 512 || comment.length == 0) return JSON.stringify({status: 'error', message: 'invalid input'});

    DB.createComment(getUser(req), comment, video.id);
    res.send( JSON.stringify({status: 'success', comment: DB.comments(video.id).slice(-1)[0]}));
});

app.post('/rating', (req, res) => {

    if(!userLoggedIn(req)) 
        return res.send( JSON.stringify({status: 'unauthenticated'}));

    var video = DB.videoByID(req.body.video);
    var rating = Math.min(Math.max(req.body.rating, -1), 1);

    if(video == undefined) return JSON.stringify({status: 'error', message: 'video not found'});

    DB.createRating(getUser(req), video.id, rating);

    var newRating = DB.rating(video.id).total;

    res.send( JSON.stringify({status: 'success', newRating: newRating}));
});


// --- Upload ---

app.get('/upload', (req, res) => {
    if(!userLoggedIn(req))
        res.sendStatus(403);
    else
        res.send(showPage('./pages/upload.html', {user: getUser(req) != undefined}));
})

app.post('/upload', (req, res) => {

    if(!userLoggedIn(req)) 
        return res.send( JSON.stringify({status: 'unauthenticated'}));

    
    var title = req.body.title;
    var description = req.body.description;

    var video = req.files.video;

    if (video == undefined || video.mimetype != 'video/mp4') 
        return res.send( JSON.stringify({ status: 'error', message: 'video incorrect format or missing!' }));
    if ((title == undefined || title.length > 50) || (description == undefined || description.length > 255)) 
        return res.send(JSON.stringify({ status: 'error', message: 'title and description missing or too long' }));

    video.mv(__dirname + "/public/videos/" + title + ".mp4", function(err){
        if(err)
            return res.status(500);
    })

    var id = DB.createVideo(title, description, 1);

    fs.rename(__dirname + "/public/videos/" + title + ".mp4", './public/videos/' + id + '.mp4')

    return res.send( JSON.stringify({ status: 'success', video: id }));
});


// --- Login ---

app.get('/login', (req, res) => {
     res.send(showPage('./pages/login.html', {}));
});

app.post('/login', (req, res) => {
     var username = req.body.username;
     var password = sha(req.body.password);
     var user = DB.ValidateUser(username, password);

    if (user) {
        setUser(req, user.id);
        //Session.set(req, 'user_id', user.id);
        res.send(JSON.stringify({ status: 'success', message: '/Home' }));
    }
    else
        res.send(JSON.stringify({ status: 'error', message: 'Invalid password or username' }));
});

app.get('/logout', (req, res) => {
    setUser(req, undefined);
    //Session.set(req, 'user_id', null);
    res.redirect("/home");
});

// --- Create User ---

app.get('/createuser', (req, res) => {
    res.send(showPage('./pages/createuser.html', {}));
});

app.post('/createuser', (req, res) => {
    var username = req.body.username;
    var password = sha(req.body.password);

    DB.createUser(username, password);
    res.send( JSON.stringify({ status: 'success', message:"/login" }));
});

//Session.clearAll();
app.use( (req, res) => {res.sendStatus(404);})
app.listen(3000, () => console.log('Youtublers Start'));



function showPage(path, vars) {
    var file = fs.readFileSync(path);
    file = file.toString();
    file = HtmlPreprocessor.process(file, vars);
    return file;

}

function userLoggedIn(request){
    return request.session.user != undefined;
}

function getUser(request)
{
    return request.session.user;
}

function setUser(request, user)
{
    request.session.user = user;
}



