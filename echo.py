import os, sys, uuid, flask
from flask import Flask, json, request, session
from datetime import datetime
from random import randint
from time import sleep
from flask_bcrypt import Bcrypt
from flask_restless import APIManager, ProcessingException
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Column, Integer, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from scapy.all import *

# from scapy.utils import rdpcap

app = Flask(__name__, static_url_path='')

# TODO - move to config.py

app.config['LOGS_DIRECTORY'] = 'logs'
app.config['PCAPS_DIRECTORY'] = 'pcaps'
app.config['ALLOWED_EXTENSIONS'] = 'pcap'
app.config['REPLAY_MESSAGE'] = "All done!  You'll find your data in LogRhythm and/or Network Monitor"
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///usecases.db'
app.secret_key = 'b\x93\x18\x07\x18\x8e\xcf\xd2\t<\x84R/\x97\x01\xfe\xefn\xe3\x9b\x96\xd3\xb8\xb4D'

# directory structures
base_dir = os.path.dirname(sys.argv[0])
log_dir = os.path.join(base_dir, app.config['LOGS_DIRECTORY'])
pcap_dir = os.path.join(base_dir, app.config['PCAPS_DIRECTORY'])

USER_HASH = '$2b$12$p8GtCmAEz/O6ftbNFngrC.3/fHzvJ8aphh4kwRiVnSO7oKTFlJKDC'
PWD_HASH = '$2b$12$aZNxFPHBiZXSJ3A76SB9r.4lTnM9.c.Yr6PWz18kSc7OvGw67P4FK'

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)


# DB classes
class Usecase(db.Model):
    id = Column(Integer, primary_key=True)
    title = Column(Text, unique=False)
    description = Column(Text, unique=False)
    logfile = Column(Text, unique=True)
    needspcaps = Column(Boolean, default=False)
    needslogs = Column(Boolean, default=True)
    pcaps = relationship('Pcap', backref=db.backref('usecase'))
    logs = relationship('Log', backref=db.backref('usecase'))


class Pcap(db.Model):
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey('usecase.id'))
    description = Column(Text, unique=False)
    message = Column(Text, unique=False)
    filename = Column(Text, unique=True)


class Log(db.Model):
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey('usecase.id'))
    description = Column(Text, unique=False)
    message = Column(Text, unique=False)
    log = Column(Text, unique=False)


# TODO add DB migrations to the project
db.create_all()


def auth_check(instance_id=None, **kw):
    if not 'token' in session:
        raise ProcessingException(description='Not Authorized', code=401)


# create our api's
api_manager = APIManager(app, flask_sqlalchemy_db=db)
api_manager.create_api(Usecase, methods=['GET', 'DELETE', 'POST', 'PATCH'],
                       allow_patch_many=True, allow_delete_many=True, results_per_page=50,
                       preprocessors=dict(GET_SINGLE=[auth_check],
                                          GET_MANY=[auth_check],
                                          DELETE_SINGLE=[auth_check],
                                          POST=[auth_check],
                                          PATCH_SINGLE=[auth_check],
                                          PATCH_MANY=[auth_check]))
api_manager.create_api(Pcap)
api_manager.create_api(Log)


# write logs out to log file
def replay_log(log, logfile):
    log_file = os.path.join(log_dir, logfile)
    timestamp = str(datetime.now())
    write_file = open(log_file, 'a+')
    write_file.write(timestamp + ' ' + log + '\n')
    write_file.close()


# write pcaps out to the wire
# requires winpcap on windows
def replay_pcap(filename):
    pcap_file = os.path.join(pcap_dir, filename).replace("\\", "/")
    os.system('tcpreplay -t -i eth0 %s' % pcap_file)

    # We're finding errors with scapy so using tcpreplay for now
    # pkts = rdpcap(pcap_file)
    # while not error:
    #     for pkt in pkts:
    #         sendp(pkt)


# Stream our response to the client and write pcaps and/or logs
def replay_stream(use_case_id):
    has_pcaps = False
    has_logs = False

    sleep(3)

    use_case = Usecase.query.filter(Usecase.id == use_case_id).first()
    yield 'data: Executing %s  ...\n\n' % use_case.title
    sleep(randint(5, 10))

    if use_case.needspcaps:
        pcaps = Pcap.query.filter(Pcap.owner_id == use_case.id).all()

        if pcaps:
            has_pcaps = True

        for row in pcaps:
            if os.path.isfile(os.path.join(pcap_dir, row.filename).replace("\\", "/")):
                replay_pcap(row.filename)
                yield 'data: %s\n\n' % row.message
                sleep(randint(5, 10))

    if use_case.needslogs:
        logfile = use_case.logfile
        logs = Log.query.filter(Log.owner_id == use_case.id).all()

        if logs:
            has_logs = True

        for row in logs:
            replay_log(row.log, logfile)
            yield 'data: %s\n\n' % row.message
            sleep(randint(5, 10))

    if has_pcaps | has_logs:
        yield 'data: %s\n\n' % app.config['REPLAY_MESSAGE']
    else:
        yield 'data: %s\n\n' % 'This use case contains no data'

    yield 'data: %s\n\n' % '...'


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1] in app.config['ALLOWED_EXTENSIONS']


@app.route('/api/upload', methods=['POST'])
def upload_pcap():
    if request.method == 'POST':
        if 'file' not in request.files:
            return json.dumps({'data': 'No file was sent to the server'}), 401

        file = request.files['file']
        if file.filename == '':
            return json.dumps({'': 'no file was selected for upload'})

        if not allowed_file(file.filename):
            return json.dumps({'message': 'File is not a pcap'}), 415

        if file:
            extension = os.path.splitext(file.filename)[1]
            new_filename = str(uuid.uuid4()) + extension
            file.save(os.path.join(pcap_dir, new_filename).replace("\\", "/"))
            return json.dumps({'filename': new_filename}), 200


# Launch our use case
@app.route('/api/execute/<use_case_id>')
def replay(use_case_id):
    return flask.Response(replay_stream(use_case_id), mimetype="text/event-stream")


# Return index.html
@app.route('/', methods=['GET'])
def index():
    return app.send_static_file('index.html')


@app.route('/api/token', methods=['GET'])
def set_token():
    session['token'] = request.remote_addr
    return json.dumps({'message': 'OK'}), 200


# Login
@app.route('/api/login', methods=['POST'])
def login():
    user = request.json

    if not user:
        return json.dumps({'message': 'Authentication failed'}), 401

    user_name = user['name']
    if not bcrypt.check_password_hash(USER_HASH, user_name):
        return json.dumps({'message': 'Authentication failed'}), 401

    password = user['password']
    if not bcrypt.check_password_hash(PWD_HASH, password):
        return json.dumps({'message': 'Authentication failed'}), 401

    return json.dumps({'message': 'OK'}), 200


if __name__ == '__main__':
    app.run(threaded=True, debug=True)
