pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-auth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

    stage('Prepare K3s Environment') {
      steps {
        script {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              mkdir -p ~/.kube
              cp $KUBECONFIG_FILE ~/.kube/config
              chmod 600 ~/.kube/config
              
              if ! kubectl get namespace $KUBE_NAMESPACE >/dev/null 2>&1; then
                kubectl create namespace $KUBE_NAMESPACE
              fi
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              mkdir -p ~/.kube
              cp $KUBECONFIG_FILE ~/.kube/config
              chmod 600 ~/.kube/config
              
              kubectl config set-context --current --namespace=$KUBE_NAMESPACE
              kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
              kubectl apply -f k8s/bibliotheque-auth-service.yaml
            '''
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        retry(3) {
          timeout(time: 3, unit: 'MINUTES') {
            withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
              sh '''
                mkdir -p ~/.kube
                cp $KUBECONFIG_FILE ~/.kube/config
                chmod 600 ~/.kube/config
                
                kubectl rollout status deployment/bibliotheque-auth \
                  --namespace=$KUBE_NAMESPACE \
                  --timeout=180s
              '''
            }
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            mkdir -p ~/.kube
            cp $KUBECONFIG_FILE ~/.kube/config
            chmod 600 ~/.kube/config
            
            if kubectl get deployment bibliotheque-auth -n $KUBE_NAMESPACE >/dev/null 2>&1; then
              kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
            fi
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}