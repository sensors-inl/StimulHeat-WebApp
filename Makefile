# JS ouput only supported in protoc versions up to 3.20.2
all:
	protoc --proto_path=. ./Protocol.proto --js_out=library=proto,binary:. 

