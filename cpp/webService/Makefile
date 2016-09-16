CXXFLAGS := -std=c++14 -O2

webService: webService.o
	$(CXX) -O2 -o webService webService.o -lboost_system -lboost_thread -lpthread -lcurl
	strip webService

clean:
	rm *.o
